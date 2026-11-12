import { backendBaseUrl, readStoredAuthBundle, resolveApiToken } from './token-store';

/** Revoke the current server session when possible (best-effort before local wipe). */
export async function revokeBackendSession(): Promise<void> {
  const base = backendBaseUrl();
  const token = resolveApiToken();
  if (!base || !token) return;
  try {
    await fetch(`${base}/v1/auth/revoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    /* offline or expired access — local sign-out still proceeds */
  }
}

export async function refreshBackendAccessToken(): Promise<boolean> {
  const base = backendBaseUrl();
  const bundle = readStoredAuthBundle();
  if (!base || !bundle?.refreshToken) return false;
  try {
    const res = await fetch(`${base}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: bundle.refreshToken }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { accessToken?: string; refreshToken?: string; expiresIn?: number };
    if (!json.accessToken) return false;
    const { writeStoredAuthBundle } = await import('./token-store');
    writeStoredAuthBundle({
      accessToken: json.accessToken,
      refreshToken: json.refreshToken ?? bundle.refreshToken,
      accessExpiresAt: Date.now() + (Number(json.expiresIn ?? 900) * 1000),
    });
    return true;
  } catch {
    return false;
  }
}
