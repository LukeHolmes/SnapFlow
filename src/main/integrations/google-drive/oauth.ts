import {
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_OAUTH_AUTHORIZE,
  GOOGLE_OAUTH_REVOKE,
  GOOGLE_OAUTH_TOKEN,
  googleDriveClientId,
  googleDriveOAuthRedirectUri,
  isGoogleDriveConfigured,
} from './config';
import type { GoogleDriveTokens } from './token-store';
import { generateOAuthState, generatePkce } from './pkce';

export interface PendingOAuth {
  state: string;
  verifier: string;
  redirectUri: string;
}

let pending: PendingOAuth | null = null;

export function getPendingOAuth(): PendingOAuth | null {
  return pending;
}

export function clearPendingOAuth(): void {
  pending = null;
}

export function buildAuthorizeUrl(): string {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive is not configured — set GOOGLE_DRIVE_CLIENT_ID in .env');
  }
  const clientId = googleDriveClientId()!;
  const redirectUri = googleDriveOAuthRedirectUri();
  const { verifier, challenge } = generatePkce();
  const state = generateOAuthState();
  pending = { state, verifier, redirectUri };

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${GOOGLE_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  ctx: PendingOAuth,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleDriveTokens> {
  const clientId = googleDriveClientId();
  if (!clientId) throw new Error('Google Drive client ID is not configured');

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    redirect_uri: ctx.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: ctx.verifier,
  });

  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error_description === 'string'
      ? json.error_description
      : typeof json.error === 'string'
        ? json.error
        : 'Token exchange failed';
    throw new Error(err);
  }

  const access = String(json.access_token ?? '');
  const refresh = String(json.refresh_token ?? '');
  if (!access || !refresh) throw new Error('Google did not return refreshable tokens — try reconnecting');

  const expiresIn = Number(json.expires_in ?? 3600);
  const email = await fetchGoogleAccountEmail(access, fetchImpl);

  return {
    access_token: access,
    refresh_token: refresh,
    expiry_date: Date.now() + expiresIn * 1000 - 30_000,
    scope: String(json.scope ?? GOOGLE_DRIVE_SCOPE),
    email,
  };
}

async function fetchGoogleAccountEmail(accessToken: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const res = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { email?: string };
  return typeof json.email === 'string' ? json.email : undefined;
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ access_token: string; expiry_date: number }> {
  const clientId = googleDriveClientId();
  if (!clientId) throw new Error('Google Drive client ID is not configured');

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === 'string' ? json.error : 'Token refresh failed';
    throw new Error(err);
  }
  const access = String(json.access_token ?? '');
  if (!access) throw new Error('Token refresh returned no access token');
  const expiresIn = Number(json.expires_in ?? 3600);
  return { access_token: access, expiry_date: Date.now() + expiresIn * 1000 - 30_000 };
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${GOOGLE_OAUTH_REVOKE}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok && res.status !== 400) {
    throw new Error('Failed to revoke Google Drive token');
  }
}

/** Validate callback query matches the in-flight PKCE session. */
export function validateOAuthCallback(state: string, code: string): { ok: true; ctx: PendingOAuth } | { ok: false; error: string } {
  if (!pending) return { ok: false, error: 'No OAuth session in progress' };
  if (pending.state !== state) return { ok: false, error: 'OAuth state mismatch' };
  if (!code) return { ok: false, error: 'Missing authorization code' };
  return { ok: true, ctx: pending };
}
