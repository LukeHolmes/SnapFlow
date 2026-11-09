import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware';
import { AppError, asyncHandler } from '../errors';
import { entitlementsFor } from '../entitlements/index';
import { effectiveTierForAccount } from '../entitlements/resolve';
import { teams } from './store';
import type { TeamRole } from './types';
import { buildInviteAcceptUrl } from './invites';
import { sync } from '../sync/store';
import { buildTeamLibraryCaptureUrl, verifyTeamLibrarySignature } from '../storage/team-signed-url';
import { defaultCaptureExpiry } from '../storage/signed-url';
import { config } from '../config';

export const teamsRouter = Router();

async function requireTeamMember(req: Request, teamId: string, roles?: TeamRole[]): Promise<void> {
  const m = await teams.getMembership(teamId, req.account!.id);
  if (!m) throw new AppError(403, 'forbidden', 'Not a member of this team');
  if (roles && !roles.includes(m.role)) throw new AppError(403, 'forbidden', 'Insufficient team role');
}

async function requireTeamTier(req: Request): Promise<void> {
  const tier = await effectiveTierForAccount(req.account!.id);
  const ent = entitlementsFor(tier);
  if (!ent.sharedLibrary) throw new AppError(402, 'team_not_entitled', 'Team library requires a Team plan');
}

teamsRouter.post('/v1/teams', requireAuth, asyncHandler(async (req, res) => {
  if (!entitlementsFor(req.account!.tier).sharedLibrary) {
    throw new AppError(402, 'team_not_entitled', 'Creating a team requires a Team plan on your account');
  }
  const existing = await teams.primaryMembership(req.account!.id);
  if (existing) throw new AppError(409, 'already_in_team', 'Leave your current team before creating another');
  const name = String(req.body?.name ?? 'My team');
  const team = await teams.create(name, req.account!.id);
  res.status(201).json({ team, seats: { used: 1, limit: team.seatLimit } });
}));

teamsRouter.get('/v1/teams/me', requireAuth, asyncHandler(async (req, res) => {
  const membership = await teams.primaryMembership(req.account!.id);
  if (!membership) {
    res.json({ team: null });
    return;
  }
  const members = await teams.listMembers(membership.team.id);
  const used = members.length;
  res.json({
    team: membership.team,
    role: membership.role,
    members,
    seats: { used, limit: membership.team.seatLimit },
  });
}));

teamsRouter.patch('/v1/teams/:teamId', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  await requireTeamMember(req, teamId, ['owner', 'admin']);
  const name = String(req.body?.name ?? '');
  if (!name.trim()) throw new AppError(400, 'bad_request', 'name is required');
  await teams.rename(teamId, name);
  res.json({ ok: true, team: await teams.get(teamId) });
}));

teamsRouter.post('/v1/teams/:teamId/invites', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  await requireTeamMember(req, teamId, ['owner', 'admin']);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = (String(req.body?.role ?? 'member') as TeamRole);
  if (!email) throw new AppError(400, 'bad_request', 'email is required');
  try {
    const { token, expiresAt } = await teams.createInvite(teamId, email, role, req.account!.id);
    const inviteUrl = buildInviteAcceptUrl(token);
    res.json({ inviteUrl, expiresAt, email, role: role === 'owner' ? 'member' : role });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'seat_limit') throw new AppError(403, 'seat_limit', 'Team seat limit reached');
    throw e;
  }
}));

teamsRouter.post('/v1/teams/invites/accept', requireAuth, asyncHandler(async (req, res) => {
  const token = String(req.body?.token ?? req.query?.token ?? '');
  if (!token) throw new AppError(400, 'bad_request', 'token is required');
  try {
    const team = await teams.acceptInvite(token, req.account!.id);
    const m = await teams.getMembership(team.id, req.account!.id);
    res.json({ ok: true, team, role: m?.role });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'invite_not_found') throw new AppError(404, 'not_found', 'Invite not found');
    if (msg === 'invite_used') throw new AppError(410, 'invite_used', 'Invite already used');
    if (msg === 'invite_expired') throw new AppError(410, 'invite_expired', 'Invite expired');
    if (msg === 'seat_limit') throw new AppError(403, 'seat_limit', 'Team seat limit reached');
    throw e;
  }
}));

teamsRouter.delete('/v1/teams/:teamId/members/me', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  try {
    await teams.leave(teamId, req.account!.id);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'owner_cannot_leave') {
      throw new AppError(403, 'owner_cannot_leave', 'Transfer ownership before leaving');
    }
    throw e;
  }
}));

teamsRouter.delete('/v1/teams/:teamId/members/:accountId', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  await requireTeamMember(req, teamId, ['owner', 'admin']);
  const targetId = req.params.accountId;
  if (targetId === req.account!.id) throw new AppError(400, 'bad_request', 'Use leave endpoint for yourself');
  try {
    await teams.removeMember(teamId, targetId);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'cannot_remove_owner') {
      throw new AppError(403, 'forbidden', 'Cannot remove the team owner');
    }
    throw e;
  }
}));

teamsRouter.get('/v1/teams/:teamId/library', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  await requireTeamMember(req, teamId);
  await requireTeamTier(req);
  res.json({ items: await teams.listLibrary(teamId) });
}));

teamsRouter.post('/v1/teams/:teamId/library', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  await requireTeamMember(req, teamId);
  await requireTeamTier(req);
  const tier = await effectiveTierForAccount(req.account!.id);
  if (!entitlementsFor(tier).cloudSync) {
    throw new AppError(402, 'sync_not_entitled', 'Cloud sync is required before sharing captures');
  }

  const captureId = String(req.body?.captureId ?? '');
  const filename = String(req.body?.filename ?? 'capture');
  const tag = req.body?.tag != null ? String(req.body.tag) : null;
  const ocrText = String(req.body?.ocrText ?? '');
  const hasPii = Boolean(req.body?.hasPii);
  if (!captureId) throw new AppError(400, 'bad_request', 'captureId is required');

  try {
    const item = await teams.shareToLibrary(teamId, req.account!.id, {
      captureId,
      ownerAccountId: req.account!.id,
      filename,
      tag,
      ocrText,
      hasPii,
    });
    res.status(201).json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'blob_missing') throw new AppError(400, 'blob_missing', 'Upload the capture blob to cloud sync first');
    throw e;
  }
}));

teamsRouter.get('/v1/teams/:teamId/library/:captureId/signed-url', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  const captureId = req.params.captureId;
  await requireTeamMember(req, teamId);
  await requireTeamTier(req);

  const item = await teams.getLibraryItem(teamId, captureId);
  if (!item) throw new AppError(404, 'not_found', 'Capture not in team library');

  const exp = defaultCaptureExpiry();
  res.json({
    url: buildTeamLibraryCaptureUrl(teamId, item.ownerAccountId, captureId, exp),
    expiresAt: exp,
    ttlMs: config.signedUrlTtlMs,
  });
}));

/** Team-scoped capture fetch: valid HMAC plus authenticated team membership (non-members → 403). */
teamsRouter.get('/v1/teams/:teamId/captures/:ownerAccountId/:captureId.png', requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.params.teamId;
  const captureId = req.params.captureId;
  const ownerAccountId = req.params.ownerAccountId;
  const sig = String(req.query.sig ?? '');
  const exp = Number(req.query.exp);
  if (!sig || !Number.isFinite(exp)) throw new AppError(403, 'forbidden', 'Invalid signature');

  const verdict = verifyTeamLibrarySignature(teamId, ownerAccountId, captureId, exp, sig);
  if (!verdict.ok) throw new AppError(403, 'forbidden', `Invalid signature (${verdict.reason})`);

  await requireTeamMember(req, teamId);

  const item = await teams.getLibraryItem(teamId, captureId);
  if (!item || item.ownerAccountId !== ownerAccountId) {
    throw new AppError(403, 'forbidden', 'Capture not shared with this team');
  }

  const bytes = await sync.readBlobBytes(ownerAccountId, captureId);
  if (!bytes) throw new AppError(404, 'not_found', 'Blob not found');
  const path = await sync.getBlobPath(ownerAccountId, captureId);
  if (path) {
    res.type('png').sendFile(path);
    return;
  }
  res.type('png').send(bytes);
}));
