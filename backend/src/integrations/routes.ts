import { Router } from 'express';
import { config } from '../config';
import { requireAuth } from '../auth/middleware';
import { AppError, asyncHandler } from '../errors';
import { entitlementsFor } from '../entitlements';
import { effectiveTierForAccount } from '../entitlements/resolve';
import { getDestinationProvider } from '../oauth/destination-providers';
import { withDestinationAccessToken, readDestinationToken } from '../oauth/destination-tokens';
import { oauthState } from '../oauth/state';
import { sync } from '../sync/store';
import { vault } from '../vault/store';
import { buildCaptureUrl, verifyCaptureSignature } from '../storage/signed-url';
import { routeParam } from '../params';

const DESTINATIONS = ['slack', 'notion', 'gmail', 'github', 'jira'] as const;

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

integrationsRouter.delete('/v1/integrations/:destination', requireAuth, asyncHandler(async (req, res) => {
  const destination = routeParam(req.params.destination);
  if (!DESTINATIONS.includes(destination as typeof DESTINATIONS[number])) {
    throw new AppError(404, 'unknown_destination', `No integration '${destination}'`);
  }
  await vault.remove(req.account!.id, destination);
  res.json({ ok: true, destination });
}));

integrationsRouter.post('/v1/integrations/:destination/oauth-url', requireAuth, asyncHandler(async (req, res) => {
  const destination = routeParam(req.params.destination);
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
  const tier = await effectiveTierForAccount(req.account!.id);
  if (!entitlementsFor(tier).cloudSync) {
    throw new AppError(402, 'sync_not_entitled', 'Cloud sync requires a Pro or Team plan');
  }
  const captureId = routeParam(req.params.captureId);
  if (!(await sync.blobAvailable(req.account!.id, captureId))) {
    throw new AppError(404, 'not_found', 'Capture blob not found');
  }
  res.json({ url: buildCaptureUrl(req.account!.id, captureId) });
}));

integrationsRouter.get('/v1/public/captures/:accountId/:captureId.png', asyncHandler(async (req, res) => {
  const sig = String(req.query.sig ?? '');
  const expRaw = req.query.exp;
  if (expRaw === undefined || String(expRaw).length === 0 || !sig) {
    throw new AppError(403, 'forbidden', 'Invalid capture signature (exp and sig required)');
  }
  const accountId = routeParam(req.params.accountId);
  const captureId = routeParam(req.params.captureId);
  const verdict = verifyCaptureSignature(accountId, captureId, Number(expRaw), sig);
  if (!verdict.ok) throw new AppError(403, 'forbidden', `Invalid capture signature (${verdict.reason})`);

  const bytes = await sync.readBlobBytes(accountId, captureId);
  if (!bytes) throw new AppError(404, 'not_found', 'Capture blob not found');
  const path = await sync.getBlobPath(accountId, captureId);
  if (path) {
    res.type('png').sendFile(path);
    return;
  }
  res.type('png').send(bytes);
}));

export async function captureUrl(accountId: string, captureId: string): Promise<string | null> {
  if (!(await sync.blobAvailable(accountId, captureId))) return null;
  return buildCaptureUrl(accountId, captureId);
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
