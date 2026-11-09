import { readFileSync } from 'node:fs';
import { nativeImage } from 'electron';
import { persistImage } from '../capture';
import type { Capture } from '../../shared/types';

export function persistDiffImage(diffImagePath: string, beforeName: string, afterName: string) {
  const buffer = readFileSync(diffImagePath);
  const img = nativeImage.createFromBuffer(buffer);
  const filename = `Diff · ${beforeName} → ${afterName}`;
  return persistImage(img, filename);
}

export function diffCaptureFromRaw(raw: { id: string; imagePath: string; filename: string }, workspaceId: string): Capture {
  return {
    id: raw.id,
    workspaceId,
    filename: raw.filename,
    imagePath: raw.imagePath,
    kind: 'screenshot',
    tag: 'diff',
    ocrText: '',
    hasPii: false,
    createdAt: Date.now(),
  };
}
