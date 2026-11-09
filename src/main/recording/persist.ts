// Persist recording blobs + thumbnails — narrow file I/O, no UI.
import { writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { recordingsDir, imagesDir } from '../paths';

export function newRecordingPaths(baseName: string): { id: string; webmPath: string; thumbPath: string } {
  const id = randomUUID();
  const safe = baseName.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'recording';
  return {
    id,
    webmPath: join(recordingsDir(), `${id}-${safe}.webm`),
    thumbPath: join(imagesDir(), `${id}-thumb.png`),
  };
}

export function writeWebmFromBase64(webmPath: string, base64: string): number {
  const buf = Buffer.from(base64, 'base64');
  writeFileSync(webmPath, buf);
  return buf.length;
}

export function appendWebmChunk(webmPath: string, base64Chunk: string, isFirst: boolean): void {
  const buf = Buffer.from(base64Chunk, 'base64');
  if (isFirst) writeFileSync(webmPath, buf);
  else appendFileSync(webmPath, buf);
}

export function writeThumbnailPng(thumbPath: string, pngBase64: string): void {
  writeFileSync(thumbPath, Buffer.from(pngBase64, 'base64'));
}

export function fileSizeBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
