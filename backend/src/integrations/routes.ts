import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { requireAuth } from '../auth/middleware';
import { AppError, asyncHandler } from '../errors';
import { entitlementsFor } from '../entitlements';
import { getDestinationProvider } from '../oauth/destination-providers';
import { withDestinationAccessToken, readDestinationToken } from '../oauth/destination-tokens';
import { oauthState } from '../oauth/state';
import { sync } from '../sync/store';

const DESTINATIONS = ['slack', 'notion', 'gmail', 'github'] as const;

export const integrationsRouter = Router();

integrationsRouter.get('/v1/integrations/statuses', requireAuth, asyncHandler(async (req, res) => {
  const statuses = await Promise.all(DESTINATIONS.map(async destination => {
    const stored = await readDestinationToken(req.account!.id, destination);
    return stored
      ? {
          destination,
          connected: true,
          state: 'connected',
          label: stored.profile?.label,
          secondary: stored.profile?.secondary,
        }
      : {
          destination,
          connected: false,
          state: 'disconnected',
        };
  }));
  res.json(statuses);
}));

integrationsRouter.post('/v1/integrations/:destination/oauth-url', requireAuth, asyncHandler(async (req, res) => {
  const destination = req.params.destination;
  const provider = getDestinationProvider(destination);
  if (!provider) throw new AppError(404, 'unknown_destination', `No OAuth provider for '${destination}'`);
  const options = typeof req.body === 'object' && req.body ? req.body as Record<string, string> : {};
  const state = await oauthState.createContext(provider.providerId, {
    flow: 'destination',
    destination,
    accountId: req.account!.id,
    options,
  });
  const redirectUri = `${config.oauthRedirectBase}/auth/oauth/${provider.providerId}/callback`;
  const authorizeUrl = `${provider.authorizeUrl}?${provider.buildAuthorizeParams(state, redirectUri, options).toString()}`;
  res.json({ url: authorizeUrl });
}));

integrationsRouter.get('/v1/integrations/slack/channels', requireAuth, asyncHandler(async (req, res) => {
  const json = await withDestinationAccessToken(req.account!.id, 'slack', async token =>
    getJson<{ channels?: Array<{ id: string; name: string; is_private?: boolean }> }>(
      `${config.slackApiBase}/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200`,
      { authorization: `Bearer ${token.accessToken}` },
    ),
  );
  res.json((json.channels ?? []).map(channel => ({
    id: channel.id,
    label: `#${channel.name}`,
    secondary: channel.is_private ? 'Private channel' : 'Channel',
  })));
}));

integrationsRouter.get('/v1/integrations/notion/pages', requireAuth, asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '');
  const json = await withDestinationAccessToken(req.account!.id, 'notion', async token =>
    postJson<{ results?: Array<Record<string, unknown>> }>(
      `${config.notionApiBase}/v1/search`,
      {
        query: q,
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      },
      {
        authorization: `Bearer ${token.accessToken}`,
        'notion-version': '2022-06-28',
      },
    ),
  );
  res.json((json.results ?? []).map(page => ({
    id: String(page.id),
    label: notionTitle(page) ?? 'Untitled page',
    secondary: 'Share this page with the SnapFlow integration in Notion.',
  })));
}));

integrationsRouter.get('/v1/integrations/gmail/profile', requireAuth, asyncHandler(async (req, res) => {
  const json = await withDestinationAccessToken(req.account!.id, 'gmail', async token =>
    getJson<{ emailAddress: string }>(
      `${config.gmailApiBase}/gmail/v1/users/me/profile`,
      { authorization: `Bearer ${token.accessToken}` },
    ),
  );
  res.json({ email: json.emailAddress });
}));

integrationsRouter.get('/v1/integrations/github/repos', requireAuth, asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase();
  const repos = await withDestinationAccessToken(req.account!.id, 'github', async token =>
    getJson<Array<{ full_name: string; private: boolean }>>(
      `${config.githubApiBase}/user/repos?per_page=100&sort=pushed`,
      {
        authorization: `Bearer ${token.accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'SnapFlow',
      },
    ),
  );
  res.json(repos
    .filter(repo => !q || repo.full_name.toLowerCase().includes(q))
    .map(repo => ({ id: repo.full_name, label: repo.full_name, secondary: repo.private ? 'Private' : 'Public' })));
}));

integrationsRouter.get('/v1/integrations/capture-url/:captureId', requireAuth, asyncHandler(async (req, res) => {
  if (!entitlementsFor(req.account!.tier).cloudSync) {
    throw new AppError(402, 'sync_not_entitled', 'Cloud sync requires a Pro or Team plan');
  }
  const path = await sync.getBlobPath(req.account!.id, req.params.captureId);
  if (!path) throw new AppError(404, 'not_found', 'Capture blob not found');
  res.json({ url: captureUrl(req.account!.id, req.params.captureId) });
}));

integrationsRouter.get('/v1/public/captures/:accountId/:captureId.png', asyncHandler(async (req, res) => {
  const expected = signature(req.params.accountId, req.params.captureId);
  const actual = String(req.query.sig ?? '');
  if (!safeEqual(expected, actual)) throw new AppError(403, 'forbidden', 'Invalid capture signature');
  const path = await sync.getBlobPath(req.params.accountId, req.params.captureId);
  if (!path) throw new AppError(404, 'not_found', 'Capture blob not found');
  res.type('png').sendFile(path);
}));

export function captureUrl(accountId: string, captureId: string): string {
  return `${config.publicBaseUrl}/v1/public/captures/${encodeURIComponent(accountId)}/${encodeURIComponent(captureId)}.png?sig=${encodeURIComponent(signature(accountId, captureId))}`;
}

function signature(accountId: string, captureId: string): string {
  return createHmac('sha256', config.authSecret).update(`${accountId}:${captureId}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function notionTitle(page: Record<string, unknown>): string | null {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return null;
  for (const value of Object.values(props)) {
    const title = value as { type?: string; title?: Array<{ plain_text?: string }> };
    if (title.type === 'title' && Array.isArray(title.title)) {
      const text = title.title.map(part => part.plain_text ?? '').join('').trim();
      if (text) return text;
    }
  }
  return null;
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(String((json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `Request failed (${res.status})`));
  return json;
}

async function postJson<T>(url: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(String((json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `Request failed (${res.status})`));
  return json;
}
