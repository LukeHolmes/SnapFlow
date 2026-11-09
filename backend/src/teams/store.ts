import { randomUUID } from 'node:crypto';
import { db } from '../store';
import { accounts } from '../accounts/store';
import { config } from '../config';
import { hashInviteToken, inviteExpiresAt, mintInviteToken } from './invites';
import type { Team, TeamLibraryItem, TeamMember, TeamRole } from './types';
import { sync } from '../sync/store';

function teamRow(r: Record<string, unknown>): Team {
  return {
    id: r.id as string,
    name: r.name as string,
    workspaceId: r.workspace_id as string,
    ownerId: r.owner_id as string,
    seatLimit: Number(r.seat_limit),
    createdAt: Number(r.created_at),
  };
}

function memberRow(r: Record<string, unknown>): TeamMember {
  return {
    teamId: r.team_id as string,
    accountId: r.account_id as string,
    email: r.email as string,
    role: r.role as TeamRole,
    joinedAt: Number(r.joined_at),
  };
}

function libraryRow(r: Record<string, unknown>): TeamLibraryItem {
  return {
    teamId: r.team_id as string,
    captureId: r.capture_id as string,
    ownerAccountId: r.owner_account_id as string,
    sharedBy: r.shared_by as string,
    filename: r.filename as string,
    tag: (r.tag as string | null) ?? null,
    ocrText: (r.ocr_text as string) ?? '',
    hasPii: Number(r.has_pii) === 1,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export const teams = {
  async create(name: string, ownerAccountId: string): Promise<Team> {
    const id = randomUUID();
    const workspaceId = `team_${id}`;
    const createdAt = Date.now();
    const seatLimit = config.teamDefaultSeatLimit;
    await db().tx(async d => {
      await d.run(
        `INSERT INTO teams (id, name, workspace_id, owner_id, seat_limit, created_at) VALUES (?,?,?,?,?,?)`,
        [id, name.trim() || 'My team', workspaceId, ownerAccountId, seatLimit, createdAt],
      );
      await d.run(
        `INSERT INTO team_members (team_id, account_id, role, joined_at) VALUES (?,?,?,?)`,
        [id, ownerAccountId, 'owner', createdAt],
      );
    });
    return (await this.get(id))!;
  },

  async get(id: string): Promise<Team | undefined> {
    const r = await db().get(`SELECT * FROM teams WHERE id = ?`, [id]);
    return r ? teamRow(r) : undefined;
  },

  async rename(teamId: string, name: string): Promise<void> {
    await db().run(`UPDATE teams SET name = ? WHERE id = ?`, [name.trim() || 'My team', teamId]);
  },

  async memberCount(teamId: string): Promise<number> {
    const r = await db().get<{ c: number }>(`SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?`, [teamId]);
    return Number(r?.c ?? 0);
  },

  async getMembership(teamId: string, accountId: string): Promise<TeamMember | undefined> {
    const r = await db().get(
      `SELECT m.*, a.email FROM team_members m JOIN accounts a ON a.id = m.account_id WHERE m.team_id = ? AND m.account_id = ?`,
      [teamId, accountId],
    );
    return r ? memberRow(r) : undefined;
  },

  async primaryMembership(accountId: string): Promise<{ team: Team; role: TeamRole } | undefined> {
    const r = await db().get(
      `SELECT t.*, m.role AS member_role FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.account_id = ? LIMIT 1`,
      [accountId],
    );
    if (!r) return undefined;
    return { team: teamRow(r), role: r.member_role as TeamRole };
  },

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const rows = await db().query(
      `SELECT m.*, a.email FROM team_members m JOIN accounts a ON a.id = m.account_id WHERE m.team_id = ? ORDER BY m.joined_at`,
      [teamId],
    );
    return rows.map(memberRow);
  },

  async leave(teamId: string, accountId: string): Promise<void> {
    const m = await this.getMembership(teamId, accountId);
    if (!m) return;
    if (m.role === 'owner') throw new Error('owner_cannot_leave');
    await db().run(`DELETE FROM team_members WHERE team_id = ? AND account_id = ?`, [teamId, accountId]);
  },

  async removeMember(teamId: string, targetAccountId: string): Promise<void> {
    const target = await this.getMembership(teamId, targetAccountId);
    if (!target) return;
    if (target.role === 'owner') throw new Error('cannot_remove_owner');
    await db().run(`DELETE FROM team_members WHERE team_id = ? AND account_id = ?`, [teamId, targetAccountId]);
  },

  async createInvite(teamId: string, email: string, role: TeamRole, createdBy: string): Promise<{ token: string; inviteId: string; expiresAt: number }> {
    const count = await this.memberCount(teamId);
    const team = await this.get(teamId);
    if (!team) throw new Error('team_not_found');
    if (count >= team.seatLimit) throw new Error('seat_limit');

    const token = mintInviteToken();
    const id = randomUUID();
    const expiresAt = inviteExpiresAt();
    const createdAt = Date.now();
    const normalizedRole: TeamRole = role === 'owner' ? 'member' : role;
    await db().run(
      `INSERT INTO team_invites (id, team_id, email, role, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, teamId, email.trim().toLowerCase(), normalizedRole, hashInviteToken(token), expiresAt, createdBy, createdAt],
    );
    return { token, inviteId: id, expiresAt };
  },

  async acceptInvite(token: string, accountId: string): Promise<Team> {
    const hash = hashInviteToken(token);
    const invite = await db().get(`SELECT * FROM team_invites WHERE token_hash = ?`, [hash]);
    if (!invite) throw new Error('invite_not_found');
    if (invite.used_at != null) throw new Error('invite_used');
    if (Number(invite.expires_at) < Date.now()) throw new Error('invite_expired');

    const teamId = invite.team_id as string;
    const team = await this.get(teamId);
    if (!team) throw new Error('team_not_found');

    const existing = await this.getMembership(teamId, accountId);
    if (existing) {
      await db().run(`UPDATE team_invites SET used_at = ? WHERE id = ?`, [Date.now(), invite.id]);
      return team;
    }

    const count = await this.memberCount(teamId);
    if (count >= team.seatLimit) throw new Error('seat_limit');

    const role = invite.role as TeamRole;
    const joinedAt = Date.now();
    await db().tx(async d => {
      await d.run(`INSERT INTO team_members (team_id, account_id, role, joined_at) VALUES (?,?,?,?)`, [
        teamId,
        accountId,
        role,
        joinedAt,
      ]);
      await d.run(`UPDATE team_invites SET used_at = ? WHERE id = ?`, [joinedAt, invite.id]);
    });
    return (await this.get(teamId))!;
  },

  async shareToLibrary(
    teamId: string,
    sharedBy: string,
    item: { captureId: string; ownerAccountId: string; filename: string; tag: string | null; ocrText: string; hasPii: boolean },
  ): Promise<TeamLibraryItem> {
    const now = Date.now();
    const team = await this.get(teamId);
    if (!team) throw new Error('team_not_found');
    if (!(await sync.blobAvailable(item.ownerAccountId, item.captureId))) {
      throw new Error('blob_missing');
    }
    await db().run(
      `INSERT INTO team_library (team_id, capture_id, owner_account_id, shared_by, filename, tag, ocr_text, has_pii, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (team_id, capture_id) DO UPDATE SET
         filename = excluded.filename, tag = excluded.tag, ocr_text = excluded.ocr_text,
         has_pii = excluded.has_pii, updated_at = excluded.updated_at, shared_by = excluded.shared_by`,
      [
        teamId,
        item.captureId,
        item.ownerAccountId,
        sharedBy,
        item.filename,
        item.tag,
        item.ocrText,
        item.hasPii ? 1 : 0,
        now,
        now,
      ],
    );
    await sync.push(item.ownerAccountId, [{
      id: item.captureId,
      workspaceId: team.workspaceId,
      filename: item.filename,
      tag: item.tag,
      ocrText: item.ocrText,
      hasPii: item.hasPii,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    }]);
    const row = await db().get(`SELECT * FROM team_library WHERE team_id = ? AND capture_id = ?`, [teamId, item.captureId]);
    return libraryRow(row!);
  },

  async listLibrary(teamId: string): Promise<TeamLibraryItem[]> {
    const rows = await db().query(`SELECT * FROM team_library WHERE team_id = ? ORDER BY updated_at DESC`, [teamId]);
    return rows.map(libraryRow);
  },

  async getLibraryItem(teamId: string, captureId: string): Promise<TeamLibraryItem | undefined> {
    const r = await db().get(`SELECT * FROM team_library WHERE team_id = ? AND capture_id = ?`, [teamId, captureId]);
    return r ? libraryRow(r) : undefined;
  },

  async ensureAccountForEmail(email: string): Promise<string> {
    const acc = await accounts.getOrCreate(email, 'free');
    return acc.id;
  },
};
