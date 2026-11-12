import { shell } from 'electron';
import { openExternalHttps } from '../shell-safe';
import { backendBaseUrl } from './token-store';

export type LoginProvider = 'google' | 'github';

export async function startOAuthLogin(provider: LoginProvider): Promise<{ ok: boolean; detail: string }> {
  const base = backendBaseUrl();
  if (!base) return { ok: false, detail: 'Set SNAPFLOW_CLOUD_URL or SNAPFLOW_AI_PROXY_URL in .env' };
  const url = `${base}/auth/oauth/${provider}/start`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      openExternalHttps(url);
    } else if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      await shell.openExternal(url);
    } else {
      return { ok: false, detail: 'Sign-in requires HTTPS except localhost development' };
    }
  } catch {
    return { ok: false, detail: 'Invalid backend URL' };
  }
  return { ok: true, detail: 'Complete sign-in in your browser' };
}
