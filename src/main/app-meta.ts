import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function legalPath(filename: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'legal', filename);
  return join(app.getAppPath(), 'docs', filename);
}

export function readLegalDraft(filename: string): string {
  return readFileSync(legalPath(filename), 'utf8');
}

export function readBundledLicenseNotices(): string {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'third-party-licenses.txt')
  : join(app.getAppPath(), 'resources', 'third-party-licenses.txt');
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return 'Third-party licence notices are generated during packaging (npm run dist).';
  }
}
