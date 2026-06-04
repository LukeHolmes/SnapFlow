import { AppError } from '../errors';
import { vault } from '../vault/store';
import { getDestinationProvider, type DestinationConnectionProfile, type DestinationOAuthId, type StoredDestinationToken } from './destination-providers';

export interface StoredDestinationSecret extends StoredDestinationToken {
  profile?: DestinationConnectionProfile;
}

export async function readDestinationToken(accountId: string, destination: DestinationOAuthId): Promise<StoredDestinationSecret | null> {
  const secret = await vault.reveal(accountId, destination);
  if (!secret) return null;
  return parseStoredSecret(secret);
}

export async function storeDestinationToken(
  accountId: string,
  destination: DestinationOAuthId,
  token: StoredDestinationToken,
  profile: DestinationConnectionProfile,
): Promise<void> {
  await vault.put(accountId, destination, JSON.stringify({ ...token, profile }));
}

export async function ensureDestinationToken(accountId: string, destination: DestinationOAuthId): Promise<StoredDestinationSecret> {
  const stored = await readDestinationToken(accountId, destination);
  if (!stored) throw notConnected(destination);
  if (!stored.expiresAt || stored.expiresAt > Date.now() + 30_000) return stored;

  const provider = getDestinationProvider(destination);
  if (!provider || !stored.refreshToken) throw reconnectRequired(destination);

  try {
    const refreshed = await provider.refresh(stored);
    const profile = await provider.describe(refreshed);
    await storeDestinationToken(accountId, destination, refreshed, profile);
    return { ...refreshed, profile };
  } catch (error) {
    throw mapAuthError(destination, error);
  }
}

export async function withDestinationAccessToken<T>(
  accountId: string,
  destination: DestinationOAuthId,
  run: (token: StoredDestinationSecret) => Promise<T>,
): Promise<T> {
  const first = await ensureDestinationToken(accountId, destination);
  try {
    return await run(first);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    if (!first.refreshToken) throw reconnectRequired(destination);
    const provider = getDestinationProvider(destination);
    if (!provider) throw reconnectRequired(destination);
    try {
      const refreshed = await provider.refresh(first);
      const profile = await provider.describe(refreshed);
      await storeDestinationToken(accountId, destination, refreshed, profile);
      try {
        return await run({ ...refreshed, profile });
      } catch (nextError) {
        if (isAuthError(nextError)) throw reconnectRequired(destination);
        throw nextError;
      }
    } catch (refreshError) {
      throw mapAuthError(destination, refreshError);
    }
  }
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /401|403|unauthori|invalid_grant/i.test(error.message);
}

function parseStoredSecret(secret: string): StoredDestinationSecret {
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    if (typeof parsed.accessToken === 'string' && parsed.accessToken) {
      return parsed as unknown as StoredDestinationSecret;
    }
  } catch {
    // Legacy vault entries stored only the raw access token string.
  }
  return { accessToken: secret };
}

function notConnected(destination: DestinationOAuthId): AppError {
  return new AppError(409, 'not_connected', `${providerLabel(destination)} is not connected. Reconnect ${providerLabel(destination)} to continue.`);
}

function reconnectRequired(destination: DestinationOAuthId): AppError {
  return new AppError(409, 'reconnect_required', `Reconnect ${providerLabel(destination)} to continue.`);
}

function mapAuthError(destination: DestinationOAuthId, error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isAuthError(error)) return reconnectRequired(destination);
  return new AppError(502, 'destination_auth_failed', error instanceof Error ? error.message : `Unable to use ${providerLabel(destination)}`);
}

function providerLabel(destination: DestinationOAuthId): string {
  switch (destination) {
    case 'gmail': return 'Gmail';
    case 'github': return 'GitHub';
    case 'notion': return 'Notion';
    case 'slack': return 'Slack';
  }
}
