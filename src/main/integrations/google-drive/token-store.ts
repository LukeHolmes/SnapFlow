import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GoogleDriveTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  email?: string;
}

export interface TokenStore {
  read(): GoogleDriveTokens | null;
  write(tokens: GoogleDriveTokens): void;
  clear(): void;
}

type EncryptFn = (plain: string) => Buffer;
type DecryptFn = (buf: Buffer) => string;

function defaultTokenPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    const dir = join(app.getPath('userData'), 'integrations');
    mkdirSync(dir, { recursive: true });
    return join(dir, 'google-drive.tokens');
  } catch {
    const dir = join(process.cwd(), '.snapflow-test-data', 'integrations');
    mkdirSync(dir, { recursive: true });
    return join(dir, 'google-drive.tokens');
  }
}

function electronSafeStorage(): { encrypt: EncryptFn; decrypt: DecryptFn; available: boolean } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron') as typeof import('electron');
    if (!safeStorage.isEncryptionAvailable()) return null;
    return {
      available: true,
      encrypt: (plain: string) => safeStorage.encryptString(plain),
      decrypt: (buf: Buffer) => safeStorage.decryptString(buf),
    };
  } catch {
    return null;
  }
}

export function createTokenStore(tokenPath = defaultTokenPath()): TokenStore {
  const crypto = electronSafeStorage();
  return {
    read(): GoogleDriveTokens | null {
      if (!existsSync(tokenPath)) return null;
      try {
        const raw = readFileSync(tokenPath);
        const json = crypto ? crypto.decrypt(raw) : raw.toString('utf8');
        return JSON.parse(json) as GoogleDriveTokens;
      } catch {
        return null;
      }
    },
    write(tokens: GoogleDriveTokens): void {
      const json = JSON.stringify(tokens);
      const payload = crypto ? crypto.encrypt(json) : Buffer.from(json, 'utf8');
      writeFileSync(tokenPath, payload);
    },
    clear(): void {
      if (existsSync(tokenPath)) unlinkSync(tokenPath);
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryTokenStore(): TokenStore & { _data: GoogleDriveTokens | null } {
  const state = { _data: null as GoogleDriveTokens | null };
  return {
    get _data() { return state._data; },
    read: () => state._data,
    write: (t) => { state._data = t; },
    clear: () => { state._data = null; },
  };
}

let activeStore: TokenStore | null = null;

export function getGoogleDriveTokenStore(): TokenStore {
  if (!activeStore) activeStore = createTokenStore();
  return activeStore;
}

export function setGoogleDriveTokenStoreForTests(store: TokenStore | null): void {
  activeStore = store;
}
