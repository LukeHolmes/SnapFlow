// OAuth 2.0 provider abstraction. Google and GitHub presets are built from env;
// tests can register a mock provider. The flow is standard authorization-code.
import { config } from '../config';

export interface OAuthProvider {
  id: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  extractEmail(userInfo: Record<string, unknown>): string | null;
}

const extra: Record<string, OAuthProvider> = {};
/** Test hook: register/override a provider (e.g. one pointing at a mock server). */
export function registerProvider(p: OAuthProvider): void { extra[p.id] = p; }

function fromEnv(): Record<string, OAuthProvider> {
  const p: Record<string, OAuthProvider> = {};
  if (config.googleClientId) p.google = {
    id: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    clientId: config.googleClientId, clientSecret: config.googleClientSecret,
    extractEmail: (i) => (i.email as string) ?? null,
  };
  if (config.githubClientId) p.github = {
    id: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',   // /user/emails for private emails (prod TODO)
    scope: 'read:user user:email',
    clientId: config.githubClientId, clientSecret: config.githubClientSecret,
    extractEmail: (i) => (i.email as string) ?? null,
  };
  return p;
}

export function getProvider(id: string): OAuthProvider | undefined {
  return extra[id] ?? fromEnv()[id];
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string, redirectUri: string): string {
  const q = new URLSearchParams({
    response_type: 'code', client_id: provider.clientId, redirect_uri: redirectUri,
    scope: provider.scope, state,
  });
  return `${provider.authorizeUrl}?${q.toString()}`;
}

export async function exchangeCode(provider: OAuthProvider, code: string, redirectUri: string): Promise<string> {
  const res = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: provider.clientId, client_secret: provider.clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('no access_token in token response');
  return json.access_token;
}

export async function fetchEmail(provider: OAuthProvider, accessToken: string): Promise<string | null> {
  const res = await fetch(provider.userInfoUrl, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', 'user-agent': 'SnapFlow' },
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  return provider.extractEmail((await res.json()) as Record<string, unknown>);
}
