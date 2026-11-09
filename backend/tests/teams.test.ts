import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-teams-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.DATA_DIR = dir;
process.env.AUTH_SECRET = 'test-team-secret';
process.env.PUBLIC_BASE_URL = 'http://localhost:3998';
process.env.TEAM_DEFAULT_SEAT_LIMIT = '3';

const { initDb, _resetDb } = await import('../src/store');
const { _resetBlobStorage } = await import('../src/storage');
const { sync } = await import('../src/sync/store');
const { issueToken } = await import('../src/auth/tokens');
const { accounts } = await import('../src/accounts/store');
const { teams } = await import('../src/teams/store');
const { hashInviteToken } = await import('../src/teams/invites');
const { buildTeamLibraryCaptureUrl } = await import('../src/storage/team-signed-url');

await initDb();
const { createApp } = await import('../src/index');
const app = createApp();

async function bearer(email: string, tier: 'free' | 'pro' | 'team' = 'pro') {
  const account = await accounts.getOrCreate(email, tier);
  return { token: issueToken(account.id), accountId: account.id, email: account.email };
}

after(async () => {
  await _resetDb();
  _resetBlobStorage();
});

test('owner can create team; pro account cannot', async () => {
  const owner = await bearer('owner@team.test', 'team');
  const pro = await bearer('pro-only@team.test', 'pro');

  const denied = await request(app).post('/v1/teams').set('Authorization', `Bearer ${pro.token}`).send({ name: 'Nope' });
  assert.equal(denied.status, 402);

  const created = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'QA Squad' });
  assert.equal(created.status, 201);
  assert.equal(created.body.team.name, 'QA Squad');
  assert.equal(created.body.seats.used, 1);
});

test('role permissions: admin invites, member cannot remove others', async () => {
  const owner = await bearer('roles-owner@team.test', 'team');
  const admin = await bearer('roles-admin@team.test', 'pro');
  const member = await bearer('roles-member@team.test', 'pro');

  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Roles' });
  const teamId = teamRes.body.team.id as string;

  const adminInvite = await teams.createInvite(teamId, 'roles-admin@team.test', 'admin', (await accounts.getOrCreate('roles-owner@team.test', 'team')).id);
  await teams.acceptInvite(adminInvite.token, (await accounts.getOrCreate('roles-admin@team.test', 'pro')).id);

  const adminInviteOk = await request(app)
    .post(`/v1/teams/${teamId}/invites`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ email: 'another@team.test', role: 'member' });
  assert.equal(adminInviteOk.status, 200);
  assert.ok(adminInviteOk.body.inviteUrl);

  const memInvite = await teams.createInvite(teamId, 'roles-member@team.test', 'member', (await accounts.getOrCreate('roles-owner@team.test', 'team')).id);
  await teams.acceptInvite(memInvite.token, (await accounts.getOrCreate('roles-member@team.test', 'pro')).id);

  const memberInviteAttempt = await request(app)
    .post(`/v1/teams/${teamId}/invites`)
    .set('Authorization', `Bearer ${member.token}`)
    .send({ email: 'extra@team.test', role: 'member' });
  assert.equal(memberInviteAttempt.status, 403);
});

test('seat limit blocks invite accept', async () => {
  const owner = await bearer('seats-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Tiny' });
  const teamId = teamRes.body.team.id as string;

  const ownerId = (await accounts.getOrCreate('seats-owner@team.test', 'team')).id;
  const pending = await teams.createInvite(teamId, 'seat-overflow@team.test', 'member', ownerId);
  const emails = ['seat-b@team.test', 'seat-c@team.test'];
  for (const email of emails) {
    const inv = await teams.createInvite(teamId, email, 'member', ownerId);
    await teams.acceptInvite(inv.token, (await accounts.getOrCreate(email, 'pro')).id);
  }

  const overflowUser = await accounts.getOrCreate('seat-overflow@team.test', 'pro');
  await assert.rejects(() => teams.acceptInvite(pending.token, overflowUser.id), /seat_limit/);
});

test('invite accept requires matching account email (case-insensitive)', async () => {
  const owner = await bearer('bind-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Bind' });
  const teamId = teamRes.body.team.id as string;
  const ownerId = (await accounts.getOrCreate('bind-owner@team.test', 'team')).id;
  const inv = await teams.createInvite(teamId, 'Colleague@Company.COM', 'member', ownerId);

  const wrongUser = await bearer('wrong@team.test', 'pro');
  const mismatch = await request(app)
    .post('/v1/teams/invites/accept')
    .set('Authorization', `Bearer ${wrongUser.token}`)
    .send({ token: inv.token });
  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.body.error, 'invite_email_mismatch');

  const rightUser = await bearer('colleague@company.com', 'pro');
  const accept = await request(app)
    .post('/v1/teams/invites/accept')
    .set('Authorization', `Bearer ${rightUser.token}`)
    .send({ token: inv.token });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.team.id, teamId);
});

test('invite token is single-use and expires', async () => {
  const owner = await bearer('invite-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Invites' });
  const teamId = teamRes.body.team.id as string;
  const inv = await teams.createInvite(teamId, 'once@team.test', 'member', (await accounts.getOrCreate('invite-owner@team.test', 'team')).id);
  const invitee = await bearer('once@team.test', 'pro');

  const accept1 = await request(app).post('/v1/teams/invites/accept').set('Authorization', `Bearer ${invitee.token}`).send({ token: inv.token });
  assert.equal(accept1.status, 200);

  const accept2 = await request(app).post('/v1/teams/invites/accept').set('Authorization', `Bearer ${invitee.token}`).send({ token: inv.token });
  assert.equal(accept2.status, 410);

  const expiredHash = hashInviteToken('expired-token');
  await (await import('../src/store')).db().run(
    `INSERT INTO team_invites (id, team_id, email, role, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['inv_exp', teamId, 'late@team.test', 'member', expiredHash, Date.now() - 1000, invitee.accountId, Date.now()],
  );
  const late = await bearer('late@team.test', 'pro');
  const acceptExpired = await request(app).post('/v1/teams/invites/accept').set('Authorization', `Bearer ${late.token}`).send({ token: 'expired-token' });
  assert.equal(acceptExpired.status, 410);
});

test('team member inherits Team entitlements', async () => {
  const owner = await bearer('ent-owner@team.test', 'team');
  await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Ent' });
  const member = await bearer('ent-member@team.test', 'pro');
  const teamId = (await teams.primaryMembership((await accounts.getOrCreate('ent-owner@team.test', 'team')).id))!.team.id;
  const inv = await teams.createInvite(teamId, 'ent-member@team.test', 'member', (await accounts.getOrCreate('ent-owner@team.test', 'team')).id);
  await teams.acceptInvite(inv.token, member.accountId);

  const ent = await request(app).get('/v1/entitlements').set('Authorization', `Bearer ${member.token}`);
  assert.equal(ent.body.tier, 'team');
  assert.equal(ent.body.sharedLibrary, true);
  assert.equal(ent.body.accountTier, 'pro');
});

test('team library signed URL: member allowed, outsider 403', async () => {
  const owner = await bearer('lib-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Library' });
  const teamId = teamRes.body.team.id as string;
  const captureId = 'cap_team_lib';

  await sync.putBlob(owner.accountId, captureId, Buffer.from('team-lib-png').toString('base64'));

  const share = await request(app)
    .post(`/v1/teams/${teamId}/library`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ captureId, filename: 'Shared shot', ocrText: 'hello', hasPii: false });
  assert.equal(share.status, 201);

  const outsider = await bearer('outsider@team.test', 'pro');
  const mintDenied = await request(app)
    .get(`/v1/teams/${teamId}/library/${captureId}/signed-url`)
    .set('Authorization', `Bearer ${outsider.token}`);
  assert.equal(mintDenied.status, 403);

  const mintOk = await request(app)
    .get(`/v1/teams/${teamId}/library/${captureId}/signed-url`)
    .set('Authorization', `Bearer ${owner.token}`);
  assert.equal(mintOk.status, 200);

  const url = new URL(mintOk.body.url);
  const fetchOutsider = await request(app)
    .get(url.pathname + url.search)
    .set('Authorization', `Bearer ${outsider.token}`);
  assert.equal(fetchOutsider.status, 403);

  const fetchMember = await request(app)
    .get(url.pathname + url.search)
    .set('Authorization', `Bearer ${owner.token}`);
  assert.equal(fetchMember.status, 200);
  assert.ok(fetchMember.body.length > 0);

  assert.ok(buildTeamLibraryCaptureUrl(teamId, owner.accountId, captureId));
});

test('removed member cannot list library or fetch shared capture', async () => {
  const owner = await bearer('rm-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Remove' });
  const teamId = teamRes.body.team.id as string;
  const captureId = 'cap_after_remove';
  const ownerId = (await accounts.getOrCreate('rm-owner@team.test', 'team')).id;

  const member = await bearer('rm-member@team.test', 'pro');
  const inv = await teams.createInvite(teamId, 'rm-member@team.test', 'member', ownerId);
  await teams.acceptInvite(inv.token, member.accountId);

  await sync.putBlob(owner.accountId, captureId, Buffer.from('png-after-remove').toString('base64'));
  await request(app)
    .post(`/v1/teams/${teamId}/library`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ captureId, filename: 'f', ocrText: '', hasPii: false });

  const memberList = await request(app)
    .get(`/v1/teams/${teamId}/library`)
    .set('Authorization', `Bearer ${member.token}`);
  assert.equal(memberList.status, 200);

  await request(app)
    .delete(`/v1/teams/${teamId}/members/${member.accountId}`)
    .set('Authorization', `Bearer ${owner.token}`);

  const deniedList = await request(app)
    .get(`/v1/teams/${teamId}/library`)
    .set('Authorization', `Bearer ${member.token}`);
  assert.equal(deniedList.status, 403);

  const mint = await request(app)
    .get(`/v1/teams/${teamId}/library/${captureId}/signed-url`)
    .set('Authorization', `Bearer ${owner.token}`);
  const url = new URL(mint.body.url);
  const deniedFetch = await request(app)
    .get(url.pathname + url.search)
    .set('Authorization', `Bearer ${member.token}`);
  assert.equal(deniedFetch.status, 403);
});

test('non-member cannot list team library', async () => {
  const owner = await bearer('stranger-owner@team.test', 'team');
  const teamRes = await request(app).post('/v1/teams').set('Authorization', `Bearer ${owner.token}`).send({ name: 'Strangers' });
  const teamId = teamRes.body.team.id as string;
  const stranger = await bearer('stranger-outsider@team.test', 'pro');
  const res = await request(app).get(`/v1/teams/${teamId}/library`).set('Authorization', `Bearer ${stranger.token}`);
  assert.equal(res.status, 403);
});
