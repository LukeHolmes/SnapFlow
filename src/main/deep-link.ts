import type { DestinationId } from '../shared/types';

const VALID_DESTINATIONS: ReadonlySet<string> = new Set([
  'slack', 'notion', 'gmail', 'github', 'jira', 'google-drive',
]);

export interface DeepLinkResult {
  kind: 'connected' | 'error';
  destination: DestinationId | null;
  message?: string;
}

/** Parses snapflow:// deep links returned after OAuth (see backend oauth/routes.ts). */
export function parseDeepLinkUrl(raw: string): DeepLinkResult | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'snapflow:') return null;

  const destination = url.searchParams.get('destination');
  const oauthStatus = url.searchParams.get('oauth');

  if (oauthStatus === 'connected' && destination && VALID_DESTINATIONS.has(destination)) {
    return { kind: 'connected', destination: destination as DestinationId };
  }

  const error = url.searchParams.get('error');
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
