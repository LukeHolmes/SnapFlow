// Pure PNG scroll-stitch helpers (guided scrolling capture MVP).
// Kept separate from Electron so unit tests can validate overlap logic headlessly.

import { PNG } from 'pngjs';

export interface ScrollStitchResult {
  png: PNG;
  confidence: number;
  frameCount: number;
  width: number;
  height: number;
  warnings: string[];
}

/** Vertically stitch sample frames, deduplicating scroll overlap between consecutive bands. */
export function stitchScrollFrames(pngs: PNG[]): ScrollStitchResult {
  const frames = pngs.filter(png => png.width > 0 && png.height > 0);
  if (!frames.length) throw new Error('No frames captured for scrolling capture');

  const warnings: string[] = [];
  const width = Math.min(...frames.map(png => png.width));
  const overlapResults: Array<{ overlap: number; score: number; reliable: boolean }> = [];
  for (let i = 1; i < frames.length; i += 1) {
    const result = findOverlap(frames[i - 1], frames[i], width);
    overlapResults.push(result);
    if (!result.reliable) warnings.push(`Low-confidence alignment between frames ${i} and ${i + 1}; appended with minimal dedupe.`);
  }

  const height = frames[0].height + frames.slice(1).reduce((sum, png, idx) => sum + Math.max(1, png.height - overlapResults[idx].overlap), 0);
  const out = new PNG({ width, height, colorType: 6 });
  out.data.fill(255);

  let yOffset = 0;
  copyRows(frames[0], out, 0, yOffset, frames[0].height, width);
  yOffset += frames[0].height;

  for (let i = 1; i < frames.length; i += 1) {
    const overlap = overlapResults[i - 1].overlap;
    const copyHeight = Math.max(1, frames[i].height - overlap);
    copyRows(frames[i], out, overlap, yOffset, copyHeight, width);
    yOffset += copyHeight;
  }

  const reliable = overlapResults.filter(r => r.reliable);
  const confidence = overlapResults.length
    ? Math.round((overlapResults.reduce((sum, r) => sum + scoreToConfidence(r.score, r.reliable), 0) / overlapResults.length) * 100) / 100
    : 1;
  if (!reliable.length && frames.length > 1) warnings.push('No strong overlaps found; result may include duplicate bands.');

  return {
    png: out,
    confidence,
    frameCount: frames.length,
    width,
    height,
    warnings,
  };
}

function copyRows(src: PNG, dest: PNG, srcY: number, destY: number, height: number, width: number): void {
  for (let y = 0; y < height; y += 1) {
    const srcStart = ((srcY + y) * src.width) * 4;
    const destStart = ((destY + y) * dest.width) * 4;
    src.data.copy(dest.data, destStart, srcStart, srcStart + width * 4);
  }
}

function findOverlap(prev: PNG, next: PNG, width: number): { overlap: number; score: number; reliable: boolean } {
  const maxOverlap = Math.max(24, Math.floor(Math.min(prev.height, next.height) * 0.75));
  const minOverlap = Math.min(maxOverlap, Math.max(24, Math.floor(Math.min(prev.height, next.height) * 0.06)));
  let best = { overlap: 0, score: Number.POSITIVE_INFINITY, reliable: false };

  for (let overlap = minOverlap; overlap <= maxOverlap; overlap += 8) {
    const score = bandDiff(prev, next, width, overlap);
    if (score < best.score) best = { overlap, score, reliable: score < 24 };
  }

  if (!best.reliable) {
    return { overlap: Math.min(32, Math.floor(Math.min(prev.height, next.height) * 0.05)), score: best.score, reliable: false };
  }

  return best;
}

function bandDiff(prev: PNG, next: PNG, width: number, overlap: number): number {
  const stepX = Math.max(4, Math.floor(width / 160));
  const stepY = Math.max(4, Math.floor(overlap / 80));
  let diff = 0;
  let samples = 0;
  const prevStartY = prev.height - overlap;

  for (let y = 0; y < overlap; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const a = ((prevStartY + y) * prev.width + x) * 4;
      const b = (y * next.width + x) * 4;
      diff += Math.abs(prev.data[a] - next.data[b]);
      diff += Math.abs(prev.data[a + 1] - next.data[b + 1]);
      diff += Math.abs(prev.data[a + 2] - next.data[b + 2]);
      samples += 3;
    }
  }

  return samples ? diff / samples : Number.POSITIVE_INFINITY;
}

function scoreToConfidence(score: number, reliable: boolean): number {
  if (!Number.isFinite(score)) return 0;
  const raw = Math.max(0, Math.min(1, 1 - score / 64));
  return reliable ? raw : raw * 0.45;
}
