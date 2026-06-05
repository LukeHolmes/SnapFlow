import { config } from '../config';

export type DestinationOAuthId = 'slack' | 'notion' | 'gmail' | 'github' | 'jira';

export interface StoredDestinationToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  meta?: Record<string, unknown>;
}

export interface DestinationConnectionProfile {
  label: string;
  secondary?: string;
  meta?: Record<string, unknown>;
}

export interface DestinationOAuthProvider {
  destination: DestinationOAuthId;
  providerId: 'slack' | 'notion' | 'google' | 'github' | 'jira';
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  buildAuthorizeParams(state: string, redirectUri: string, options: Record<string, string>): URLSearchParams;
  exchangeCode(code: string, redirectUri: string): Promise<StoredDestinationToken>;
  refresh(token: StoredDestinationToken): Promise<StoredDestinationToken>;
  describe(token: StoredDestinationToken): Promise<DestinationConnectionProfile>;
}

export function getDestinationProvider(destination: string): DestinationOAuthProvider | undefined {
  return providers()[destination as DestinationOAuthId];
}

function providers(): Record<DestinationOAuthId, DestinationOAuthProvider> {
  return {
    slack: {
      destination: 'slack',
      providerId: 'slack',
      authorizeUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      clientId: config.slackClientId,
      clientSecret: config.slackClientSecret,
      buildAuthorizeParams(state, redirectUri) {
        return new URLSearchParams({
          client_id: this.clientId,
          scope: 'files:write,channels:read,groups:read',
          redirect_uri: redirectUri,
          state,
        });
      },
      async exchangeCode(code, redirectUri) {
        const json = await postSlackToken({
          code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        });
        return {
          accessToken: required(json.access_token, 'Slack access_token'),
          refreshToken: optionalString(json.refresh_token),
          expiresAt: expiresAt(json.expires_in),
          scope: optionalString(json.scope),
          meta: json.team && typeof json.team === 'object' ? json.team as Record<string, unknown> : undefined,
        };
      },
      async refresh(token) {
        if (!token.refreshToken) throw new Error('Slack token cannot be refreshed');
        const json = await postSlackToken({
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        });
        return {
          accessToken: required(json.access_token, 'Slack access_token'),
          refreshToken: optionalString(json.refresh_token) ?? token.refreshToken,
          expiresAt: expiresAt(json.expires_in),
          scope: optionalString(json.scope) ?? token.scope,
          meta: token.meta,
        };
      },
      async describe(token) {
        const json = await getJson<Record<string, unknown>>('https://slack.com/api/auth.test', {
          authorization: `Bearer ${token.accessToken}`,
        });
        return {
          label: String(json.team ?? token.meta?.name ?? 'Slack workspace'),
          secondary: optionalString(json.user),
          meta: { workspace_name: json.team ?? token.meta?.name },
        };
      },
    },
    notion: {
      destination: 'notion',
      providerId: 'notion',
      authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      clientId: config.notionClientId,
      clientSecret: config.notionClientSecret,
      buildAuthorizeParams(state, redirectUri) {
        return new URLSearchParams({
          owner: 'user',
          client_id: this.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          state,
        });
      },
      async exchangeCode(code, redirectUri) {
        const json = await notionToken(this.clientId, this.clientSecret, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        });
        return toStoredToken(json);
      },
      async refresh(token) {
        if (!token.refreshToken) throw new Error('Notion token cannot be refreshed');
        const json = await notionToken(this.clientId, this.clientSecret, {
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        });
        return {
          ...toStoredToken(json),
          meta: token.meta,
        };
      },
      async describe(token) {
        const json = await getJson<Record<string, unknown>>(`${config.notionApiBase}/v1/users/me`, {
          authorization: `Bearer ${token.accessToken}`,
          'notion-version': '2022-06-28',
        });
        const workspaceName =
          optionalString(json.name) ??
          optionalString((json.bot as Record<string, unknown> | undefined)?.workspace_name) ??
          'Notion workspace';
        return {
          label: workspaceName,
          secondary: optionalString(json.type),
          meta: { workspace_name: workspaceName },
        };
      },
    },
    gmail: {
      destination: 'gmail',
      providerId: 'google',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      buildAuthorizeParams(state, redirectUri) {
        return new URLSearchParams({
          response_type: 'code',
          client_id: this.clientId,
          redirect_uri: redirectUri,
          scope: 'https://www.googleapis.com/auth/gmail.send',
          access_type: 'offline',
          prompt: 'consent',
          state,
        });
      },
      async exchangeCode(code, redirectUri) {
        const json = await formToken(this.tokenUrl, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        });
        return toStoredToken(json);
      },
      async refresh(token) {
        if (!token.refreshToken) throw new Error('Google token cannot be refreshed');
        const json = await formToken(this.tokenUrl, {
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        });
        return {
          ...toStoredToken(json),
          refreshToken: token.refreshToken,
          meta: token.meta,
        };
      },
      async describe(token) {
        const json = await getJson<Record<string, unknown>>(`${config.gmailApiBase}/gmail/v1/users/me/profile`, {
          authorization: `Bearer ${token.accessToken}`,
        });
        const email = required(json.emailAddress, 'Gmail emailAddress');
        return { label: email, secondary: 'Gmail', meta: { email } };
      },
    },
    github: {
      destination: 'github',
      providerId: 'github',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      buildAuthorizeParams(state, redirectUri, options) {
        return new URLSearchParams({
          client_id: this.clientId,
          redirect_uri: redirectUri,
          scope: options.scope === 'public_repo' ? 'public_repo' : 'repo',
          state,
        });
      },
      async exchangeCode(code, redirectUri) {
        const json = await formToken(this.tokenUrl, {
          code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }, { accept: 'application/json' });
        return toStoredToken(json);
      },
      async refresh(token) {
        if (!token.refreshToken) throw new Error('GitHub token cannot be refreshed');
        const json = await formToken(this.tokenUrl, {
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }, { accept: 'application/json' });
        return {
          ...toStoredToken(json),
          refreshToken: token.refreshToken,
          meta: token.meta,
        };
      },
      async describe(token) {
        const json = await getJson<Record<string, unknown>>(`${config.githubApiBase}/user`, {
          authorization: `Bearer ${token.accessToken}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'SnapFlow',
        });
        const login = required(json.login, 'GitHub login');
        return { label: login, secondary: optionalString(json.name), meta: { login } };
      },
    },
    jira: {
      destination: 'jira',
      providerId: 'jira',
      authorizeUrl: `${config.jiraAuthBase}/authorize`,
      tokenUrl: `${config.jiraAuthBase}/oauth/token`,
      clientId: config.jiraClientId,
      clientSecret: config.jiraClientSecret,
      buildAuthorizeParams(state, redirectUri) {
        return new URLSearchParams({
          audience: 'api.atlassian.com',
          client_id: this.clientId,
          scope: 'read:jira-user read:jira-work write:jira-work offline_access',
          redirect_uri: redirectUri,
          response_type: 'code',
          prompt: 'consent',
          state,
        });
      },
      async exchangeCode(code, redirectUri) {
        const json = await atlToken(this.tokenUrl, this.clientId, this.clientSecret, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        });
        return toStoredToken(json);
      },
      async refresh(token) {
        if (!token.refreshToken) throw new Error('Jira token cannot be refreshed');
        const json = await atlToken(this.tokenUrl, this.clientId, this.clientSecret, {
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        });
        return {
          ...toStoredToken(json),
          refreshToken: token.refreshToken,
          meta: token.meta,
        };
      },
      async describe(token) {
        const sites = await accessibleResources(token.accessToken);
        const site = sites[0];
        if (!site) throw new Error('No Jira sites available for this account');
        return {
          label: site.name ?? 'Jira',
          secondary: site.url ?? site.id,
          meta: { cloudId: site.id, url: site.url },
        };
      },
    },
  };
}

async function postSlackToken(body: Record<string, string>): Promise<Record<string, unknown>> {
  const json = await formToken('https://slack.com/api/oauth.v2.access', body);
  if (!json.ok) throw new Error(String(json.error ?? 'Slack OAuth failed'));
  return json;
}

async function notionToken(clientId: string, clientSecret: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  return formToken('https://api.notion.com/v1/oauth/token', body, {
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'notion-version': '2022-06-28',
  });
}

async function formToken(url: string, body: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...extraHeaders,
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error_description ?? json.error ?? `OAuth request failed (${res.status})`));
  return json;
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(String((json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `API request failed (${res.status})`));
  return json;
}

async function atlToken(url: string, clientId: string, clientSecret: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error_description ?? json.error ?? `Jira OAuth request failed (${res.status})`));
  return json;
}

async function accessibleResources(accessToken: string): Promise<Array<{ id: string; name?: string; url?: string }>> {
  return getJson(`${config.jiraApiBase}/oauth/token/accessible-resources`, {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  });
}

function toStoredToken(json: Record<string, unknown>): StoredDestinationToken {
  return {
    accessToken: required(json.access_token, 'access_token'),
    refreshToken: optionalString(json.refresh_token),
    expiresAt: expiresAt(json.expires_in),
    scope: optionalString(json.scope),
  };
}

function expiresAt(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : undefined;
}

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is missing`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
