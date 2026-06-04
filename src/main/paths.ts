import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const dataDir = (): string => app.getPath('userData');

export function imagesDir(): string {
  const d = join(dataDir(), 'captures');
  mkdirSync(d, { recursive: true });
  return d;
}

export const dbPath = (): string => join(dataDir(), 'snapflow.db');

export function diffsDir(): string {
  const d = join(dataDir(), 'diffs');
  mkdirSync(d, { recursive: true });
  return d;
}
