import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FALLBACK_FILE = 'auth-token.dat';

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

function fallbackPath(): string {
  const base = userDataPath();
  if (!base) throw new Error('Electron app is not available');
  return join(base, FALLBACK_FILE);
}

export function isAuthEncryptionAvailable(): boolean {
  const electron = loadElectron();
  return !!electron?.safeStorage.isEncryptionAvailable();
}

export function readStoredApiToken(): string | null {
  const base = userDataPath();
  if (!base) return null;
  const electron = loadElectron();
  try {
    if (electron?.safeStorage.isEncryptionAvailable()) {
      const file = join(base, FALLBACK_FILE);
      try {
        const enc = readFileSync(file);
        const plain = electron.safeStorage.decryptString(enc);
        return plain || null;
      } catch {
        return null;
      }
    }
    const plain = readFileSync(join(base, FALLBACK_FILE), 'utf8').trim();
    return plain || null;
  } catch {
    return null;
  }
}

export function writeStoredApiToken(token: string): void {
  const electron = loadElectron();
  if (!electron) throw new Error('Electron app is not available');
  mkdirSync(electron.app.getPath('userData'), { recursive: true });
  if (electron.safeStorage.isEncryptionAvailable()) {
    const enc = electron.safeStorage.encryptString(token);
    writeFileSync(fallbackPath(), enc);
    return;
  }
  writeFileSync(fallbackPath(), token, { mode: 0o600 });
}

export function clearStoredApiToken(): void {
  try {
    const base = userDataPath();
    if (base) unlinkSync(join(base, FALLBACK_FILE));
  } catch { /* ok */ }
}

/** Packaged: safeStorage only. Dev unpackaged: stored token or SNAPFLOW_API_TOKEN fallback. */
export function resolveApiToken(): string | undefined {
  const stored = readStoredApiToken();
  if (stored) return stored;
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
