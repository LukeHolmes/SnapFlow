import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FALLBACK_FILE = 'auth-token.dat';

export interface StoredAuthBundle {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt?: number;
}

type ElectronApp = {
  isPackaged: boolean;
  getPath: (name: 'userData') => string;
};

type ElectronSafeStorage = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
};

function loadElectron(): { app: ElectronApp; safeStorage: ElectronSafeStorage } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron');
    if (!electron?.app) return null;
    return { app: electron.app, safeStorage: electron.safeStorage };
  } catch {
    return null;
  }
}

function userDataPath(): string | null {
  return loadElectron()?.app.getPath('userData') ?? null;
}

function authFilePath(): string | null {
  const base = userDataPath();
  return base ? join(base, FALLBACK_FILE) : null;
}

function readRawAuthFile(): string | null {
  const file = authFilePath();
  if (!file) return null;
  const electron = loadElectron();
  try {
    if (electron?.safeStorage.isEncryptionAvailable()) {
      try {
        const enc = readFileSync(file);
        return electron.safeStorage.decryptString(enc);
      } catch {
        return null;
      }
    }
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function parseBundle(raw: string): StoredAuthBundle | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as StoredAuthBundle;
      if (typeof json.accessToken === 'string' && json.accessToken) return json;
    } catch { /* legacy plain token */ }
  }
  return { accessToken: trimmed };
}

export function isAuthEncryptionAvailable(): boolean {
  const electron = loadElectron();
  return !!electron?.safeStorage.isEncryptionAvailable();
}

export function readStoredAuthBundle(): StoredAuthBundle | null {
  const raw = readRawAuthFile();
  return raw ? parseBundle(raw) : null;
}

export function readStoredApiToken(): string | null {
  return readStoredAuthBundle()?.accessToken ?? null;
}

function writeRawAuthFile(contents: string): void {
  const electron = loadElectron();
  if (!electron) throw new Error('Electron app is not available');
  mkdirSync(electron.app.getPath('userData'), { recursive: true });
  const file = authFilePath()!;
  if (electron.safeStorage.isEncryptionAvailable()) {
    writeFileSync(file, electron.safeStorage.encryptString(contents));
    return;
  }
  writeFileSync(file, contents, { mode: 0o600 });
}

export function writeStoredAuthBundle(bundle: StoredAuthBundle): void {
  writeRawAuthFile(JSON.stringify(bundle));
}

export function writeStoredApiToken(token: string): void {
  writeStoredAuthBundle({ accessToken: token });
}

export function clearStoredApiToken(): void {
  try {
    const file = authFilePath();
    if (file) unlinkSync(file);
  } catch { /* ok */ }
}

/** Packaged: safeStorage only. Dev unpackaged: stored token or SNAPFLOW_API_TOKEN fallback. */
export function resolveApiToken(): string | undefined {
  const stored = readStoredAuthBundle();
  if (stored?.accessToken) return stored.accessToken;
  const electron = loadElectron();
  const unpackaged = !electron?.app.isPackaged;
  if (unpackaged && process.env.SNAPFLOW_API_TOKEN) {
    return process.env.SNAPFLOW_API_TOKEN;
  }
  return undefined;
}

export function backendBaseUrl(): string | undefined {
  const base = process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL;
  return base?.replace(/\/$/, '');
}

export function isBackendSignedIn(): boolean {
  return !!(backendBaseUrl() && resolveApiToken());
}
