import { shell } from 'electron';
import type { IntegrationStatus } from '../../../shared/types';
import {
  googleDriveOAuthRedirectUri,
  isGoogleDriveConfigured,
} from './config';
import {
  buildAuthorizeUrl,
  clearPendingOAuth,
  exchangeCodeForTokens,
  getPendingOAuth,
  revokeToken,
  validateOAuthCallback,
} from './oauth';
import { createMemoryTokenStore, getGoogleDriveTokenStore, type GoogleDriveTokens } from './token-store';
import { startLoopbackOAuthServer, stopLoopbackServer } from './loopback';

let fetchImpl: typeof fetch = fetch;

export function setGoogleDriveFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? fetch;
}

export function getGoogleDriveStatus(): IntegrationStatus {
  if (!isGoogleDriveConfigured()) {
    return {
      destination: 'google-drive',
      connected: false,
      state: 'disconnected',
      message: 'Set GOOGLE_DRIVE_CLIENT_ID in .env (see docs/DESTINATION_SETUP.md)',
    };
  }
  const tokens = getGoogleDriveTokenStore().read();
  if (!tokens?.refresh_token) {
    return {
      destination: 'google-drive',
      connected: false,
      state: 'disconnected',
      message: 'Connect Google Drive to upload captures from this device',
    };
  }
  return {
    destination: 'google-drive',
    connected: true,
    state: 'connected',
    label: tokens.email,
    secondary: 'Tokens stored on this device (OS keychain when available)',
  };
}

export async function connectGoogleDrive(): Promise<{ ok: boolean; detail: string }> {
  if (!isGoogleDriveConfigured()) {
    return { ok: false, detail: 'Google Drive is not configured — add GOOGLE_DRIVE_CLIENT_ID to .env' };
  }

  const redirectUri = googleDriveOAuthRedirectUri();
  const usesLoopback = redirectUri.startsWith('http://127.0.0.1') || redirectUri.startsWith('http://localhost');

  try {
    const authorizeUrl = buildAuthorizeUrl();
    await shell.openExternal(authorizeUrl);

    if (usesLoopback) {
      const { server, waitForCallback } = await startLoopbackOAuthServer(redirectUri);
      try {
        const { code, state } = await waitForCallback;
        const validated = validateOAuthCallback(state, code);
        if (!validated.ok) return { ok: false, detail: validated.error };
        const tokens = await exchangeCodeForTokens(code, validated.ctx, fetchImpl);
        getGoogleDriveTokenStore().write(tokens);
        clearPendingOAuth();
        return { ok: true, detail: `Connected Google Drive${tokens.email ? ` as ${tokens.email}` : ''}` };
      } finally {
        stopLoopbackServer(server);
        clearPendingOAuth();
      }
    }

    return { ok: true, detail: 'Complete sign-in in your browser — SnapFlow will detect the callback' };
  } catch (err) {
    clearPendingOAuth();
    return { ok: false, detail: err instanceof Error ? err.message : 'Google Drive connection failed' };
  }
}

/** Completes OAuth when redirect URI is snapflow:// (desktop deep link). */
export async function completeGoogleDriveOAuthFromDeepLink(code: string, state: string): Promise<{ ok: boolean; detail: string }> {
  const validated = validateOAuthCallback(state, code);
  if (!validated.ok) return { ok: false, detail: validated.error };
  try {
    const tokens = await exchangeCodeForTokens(code, validated.ctx, fetchImpl);
    getGoogleDriveTokenStore().write(tokens);
    clearPendingOAuth();
    return { ok: true, detail: `Connected Google Drive${tokens.email ? ` as ${tokens.email}` : ''}` };
  } catch (err) {
    clearPendingOAuth();
    return { ok: false, detail: err instanceof Error ? err.message : 'Google Drive connection failed' };
  }
}

export async function disconnectGoogleDrive(): Promise<{ ok: boolean; detail: string }> {
  const store = getGoogleDriveTokenStore();
  const tokens = store.read();
  if (!tokens) {
    return { ok: true, detail: 'Google Drive was not connected' };
  }
  try {
    await revokeToken(tokens.refresh_token || tokens.access_token, fetchImpl);
  } catch {
    // Still clear local tokens if revoke fails (network/offline).
  }
  store.clear();
  clearPendingOAuth();
  return { ok: true, detail: 'Disconnected Google Drive and removed local tokens' };
}

export function readGoogleDriveTokens(): GoogleDriveTokens | null {
  return getGoogleDriveTokenStore().read();
}

export function updateGoogleDriveTokens(next: GoogleDriveTokens): void {
  getGoogleDriveTokenStore().write(next);
}

export { createMemoryTokenStore, getPendingOAuth };
