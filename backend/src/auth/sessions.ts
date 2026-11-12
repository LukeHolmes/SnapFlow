import { createHash, randomBytes } from 'node:crypto';
import { db } from '../store';
import { config } from '../config';
import { issueAccessToken } from './tokens';
import { AppError } from '../errors';

export interface AuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

function hashRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function mintAuthCredentials(accountId: string): Promise<AuthCredentials> {
  const sessionId = `ses_${randomBytes(12).toString('base64url')}`;
  const refreshToken = randomBytes(32).toString('base64url');
  const now = Date.now();
  const refreshExpires = now + config.refreshTokenTtlMs;
  await db().run(
    `INSERT INTO auth_sessions (id, account_id, refresh_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [sessionId, accountId, hashRefresh(refreshToken), now, refreshExpires],
  );
  const expiresIn = config.accessTokenTtlSec;
  const accessToken = issueAccessToken(accountId, sessionId, expiresIn);
  return { accessToken, refreshToken, expiresIn, sessionId };
}

export async function refreshAuthCredentials(refreshToken: string): Promise<AuthCredentials> {
  const row = await db().get<{
    id: string;
    account_id: string;
    expires_at: number;
    revoked_at: number | null;
  }>(
    `SELECT id, account_id, expires_at, revoked_at FROM auth_sessions WHERE refresh_hash = ?`,
    [hashRefresh(refreshToken)],
  );
  if (!row || row.revoked_at || Date.now() > row.expires_at) {
    throw new AppError(401, 'invalid_refresh', 'Refresh token is invalid or expired');
  }
  const newRefresh = randomBytes(32).toString('base64url');
  const refreshExpires = Date.now() + config.refreshTokenTtlMs;
  await db().run(
    `UPDATE auth_sessions SET refresh_hash = ?, expires_at = ? WHERE id = ?`,
    [hashRefresh(newRefresh), refreshExpires, row.id],
  );
  const expiresIn = config.accessTokenTtlSec;
  return {
    accessToken: issueAccessToken(row.account_id, row.id, expiresIn),
    refreshToken: newRefresh,
    expiresIn,
    sessionId: row.id,
  };
}

export async function revokeSession(sessionId: string, accountId: string): Promise<boolean> {
  await db().run(
    `UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL`,
    [Date.now(), sessionId, accountId],
  );
  const row = await db().get<{ revoked_at: number | null }>(
    `SELECT revoked_at FROM auth_sessions WHERE id = ? AND account_id = ?`,
    [sessionId, accountId],
  );
  return !!row?.revoked_at;
}

export async function isSessionActive(sessionId: string, accountId: string): Promise<boolean> {
  const row = await db().get<{ revoked_at: number | null }>(
    `SELECT revoked_at FROM auth_sessions WHERE id = ? AND account_id = ?`,
    [sessionId, accountId],
  );
  if (!row) return false;
  return row.revoked_at == null;
}

/** Test and dev helper: mint a bearer access token with a persisted session. */
export async function issueBearerToken(accountId: string, accessTtlSec?: number): Promise<string> {
  const creds = await mintAuthCredentials(accountId);
  if (accessTtlSec != null && accessTtlSec !== config.accessTokenTtlSec) {
    return issueAccessToken(accountId, creds.sessionId, accessTtlSec);
  }
  return creds.accessToken;
}
