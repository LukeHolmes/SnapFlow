import { backendBaseUrl, resolveApiToken } from '../auth/token-store';
import type { AccountSummary, Tier } from '../../shared/types';

const VALID_TIERS: Tier[] = ['free', 'pro', 'team', 'perpetual'];

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

/** Signed-in profile from GET /v1/account when SNAPFLOW_API_TOKEN is configured. */
export async function fetchAccountSummary(): Promise<AccountSummary> {
  const baseUrl = backendBaseUrl();
  const token = resolveApiToken();
  if (!baseUrl || !token) return { signedIn: false };
  try {
    const res = await fetch(`${baseUrl}/v1/account`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { signedIn: false };
    const json = (await res.json()) as { email?: string; tier?: string };
    const email = typeof json.email === 'string' ? json.email : undefined;
    if (!email) return { signedIn: false };
    const tier = typeof json.tier === 'string' && VALID_TIERS.includes(json.tier as Tier) ? (json.tier as Tier) : undefined;
    return { signedIn: true, email, displayName: displayNameFromEmail(email), tier };
  } catch {
    return { signedIn: false };
  }
}
