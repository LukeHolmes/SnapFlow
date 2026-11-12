import type { DestinationId } from '../shared/types';

const VALID_DESTINATIONS: ReadonlySet<string> = new Set([
  'slack', 'notion', 'gmail', 'github', 'jira', 'google-drive',
]);

const MAX_URL_LEN = 4096;
const MAX_PARAM_LEN = 2048;

export interface DeepLinkResult {
  kind: 'connected' | 'error';
  destination: DestinationId | null;
  message?: string;
}

export interface GoogleDriveOAuthDeepLink {
  code: string;
  state: string;
}

function isAllowedOAuthCallback(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'oauth' && (path === '/callback' || path === 'callback')) return true;
  if (!host && (path === '/oauth/callback' || path === 'oauth/callback')) return true;
  return false;
}

function readBoundedParam(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  if (!v || v.length > MAX_PARAM_LEN) return null;
  return v;
}

/** Validates snapflow:// Google Drive loopback callback (code + state). */
export function parseGoogleDriveOAuthDeepLink(raw: string): GoogleDriveOAuthDeepLink | null {
  if (raw.length > MAX_URL_LEN) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'snapflow:') return null;
  if (readBoundedParam(url, 'destination') !== 'google-drive') return null;
  const code = readBoundedParam(url, 'code');
  const state = readBoundedParam(url, 'state');
  if (!code || !state) return null;
  return { code, state };
}

/** Parses snapflow:// deep links returned after OAuth (see backend oauth/routes.ts). */
export function parseDeepLinkUrl(raw: string): DeepLinkResult | null {
  if (raw.length > MAX_URL_LEN) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'snapflow:') return null;
  if (!isAllowedOAuthCallback(url)) return null;

  const destination = readBoundedParam(url, 'destination');
  const oauthStatus = readBoundedParam(url, 'oauth');

  if (oauthStatus === 'connected' && destination && VALID_DESTINATIONS.has(destination)) {
    return { kind: 'connected', destination: destination as DestinationId };
  }

  const error = readBoundedParam(url, 'error');
  if (error || oauthStatus === 'error') {
    return {
      kind: 'error',
      destination: (destination && VALID_DESTINATIONS.has(destination) ? destination : null) as DestinationId | null,
      message: error ? decodeURIComponent(error) : 'OAuth connection failed',
    };
  }

  if (destination && VALID_DESTINATIONS.has(destination)) {
    return { kind: 'connected', destination: destination as DestinationId };
  }

  return null;
}
