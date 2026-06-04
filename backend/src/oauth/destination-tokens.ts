import { vault } from '../vault/store';
import { getDestinationProvider, type DestinationConnectionProfile, type DestinationOAuthId, type StoredDestinationToken } from './destination-providers';

export interface StoredDestinationSecret extends StoredDestinationToken {
  profile?: DestinationConnectionProfile;
}

export async function readDestinationToken(accountId: string, destination: DestinationOAuthId): Promise<StoredDestinationSecret | null> {
  const secret = await vault.reveal(accountId, destination);
  if (!secret) return null;
  return JSON.parse(secret) as StoredDestinationSecret;
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
  if (!stored) throw new Error(`${destination} is not connected`);
  if (!stored.expiresAt || stored.expiresAt > Date.now() + 30_000) return stored;

  const provider = getDestinationProvider(destination);
  if (!provider || !stored.refreshToken) return stored;

  const refreshed = await provider.refresh(stored);
  const profile = await provider.describe(refreshed);
  await storeDestinationToken(accountId, destination, refreshed, profile);
  return { ...refreshed, profile };
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
    if (!first.refreshToken || !isAuthError(error)) throw error;
    const provider = getDestinationProvider(destination);
    if (!provider) throw error;
    const refreshed = await provider.refresh(first);
    const profile = await provider.describe(refreshed);
    await storeDestinationToken(accountId, destination, refreshed, profile);
    return run({ ...refreshed, profile });
  }
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /401|403|unauthori|invalid_grant/i.test(error.message);
}
