// Capture engine (architecture §4.2). Exposed behind a deliberately NARROW interface
// so it can later be swapped for a native sidecar WITHOUT touching anything upstream.
// v0.x implementation uses Electron's desktopCapturer (cross-platform, zero native build).

import { desktopCapturer, screen, nativeImage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { imagesDir } from '../paths';
import type { CaptureSource, ScrollCapturePreview } from '../../shared/types';

export interface RawCapture { id: string; imagePath: string; filename: string; }
export interface RedactionBox { x0: number; y0: number; x1: number; y1: number; }
interface StitchResult {
  image: Electron.NativeImage;
  confidence: number;
  frameCount: number;
  width: number;
  height: number;
  warnings: string[];
}

export interface Frame {
  image: Electron.NativeImage;  // full-resolution screenshot (device pixels)
  dataURL: string;              // for display in the overlay
  cssWidth: number;             // display size in CSS/DIP pixels
  cssHeight: number;
  scaleFactor: number;          // device px = css px * scaleFactor
  displayId: number;            // which display this frame belongs to
}

function deviceBox(d: Electron.Display) {
  const sf = d.scaleFactor || 1;
  return { w: Math.round(d.size.width * sf), h: Math.round(d.size.height * sf), sf };
}

/** Source-list with thumbnails for the window picker (screens + windows). */
export async function listSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 250 } });
  return sources
    .filter(s => !s.thumbnail.isEmpty())
    .map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), kind: s.id.startsWith('screen') ? 'screen' : 'window' }));
}

async function sourceImage(sourceId?: string): Promise<{ image: Electron.NativeImage; name: string }> {
  const displays = screen.getAllDisplays();
  const maxW = Math.max(...displays.map(d => deviceBox(d).w));
  const maxH = Math.max(...displays.map(d => deviceBox(d).h));
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: maxW, height: maxH } });
  const src = (sourceId && sources.find(s => s.id === sourceId)) || sources[0];
  if (!src) throw new Error('No capture source available (check screen-recording permission)');
  return { image: src.thumbnail, name: src.name || 'Capture' };
}

/** Full-resolution capture of a source (window or screen), at the best available resolution. */
export async function captureSource(sourceId?: string, filename?: string): Promise<RawCapture> {
  const src = await sourceImage(sourceId);
  return persistImage(src.image, filename || src.name || 'Capture');
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Guided scrolling capture MVP: samples the same source several times while the
 * user scrolls, then stitches the frames vertically. A native/browser sidecar can
 * later replace this with auto-scroll and overlap detection without changing IPC.
 */
export async function captureScrollingPreview(options: { sourceId?: string; frames?: number; intervalMs?: number } = {}): Promise<ScrollCapturePreview> {
  const count = Math.max(2, Math.min(8, Math.round(options.frames ?? 4)));
  const intervalMs = Math.max(250, Math.min(3000, Math.round(options.intervalMs ?? 850)));
  const images: Electron.NativeImage[] = [];
  let sourceName = 'Scrolling capture';

  for (let i = 0; i < count; i += 1) {
    const src = await sourceImage(options.sourceId);
    sourceName = src.name || sourceName;
    images.push(src.image);
    if (i < count - 1) await sleep(intervalMs);
  }

  const stitched = stitchPanorama(images);
  return {
    dataUrl: stitched.image.toDataURL(),
    filename: `${sourceName} scroll`,
    confidence: stitched.confidence,
    frameCount: stitched.frameCount,
    width: stitched.width,
    height: stitched.height,
    warnings: stitched.warnings,
  };
}

export async function captureScrollingSource(options: { sourceId?: string; frames?: number; intervalMs?: number } = {}): Promise<RawCapture> {
  const preview = await captureScrollingPreview(options);
  return persistDataUrl(preview.dataUrl, preview.filename);
}

/** Grab a single full-resolution frame of one display, for the freeze-frame overlay. */
export async function grabDisplayFrame(display: Electron.Display): Promise<Frame> {
  const { w, h, sf } = deviceBox(display);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
  const src = sources.find(s => s.display_id === String(display.id)) ?? sources[0];
  if (!src) throw new Error('No screen source available (check screen-recording permission)');
  return { image: src.thumbnail, dataURL: src.thumbnail.toDataURL(), cssWidth: display.size.width, cssHeight: display.size.height, scaleFactor: sf, displayId: display.id };
}

export const grabPrimaryFrame = (): Promise<Frame> => grabDisplayFrame(screen.getPrimaryDisplay());

/** Grab a frame for every connected display (multi-monitor region capture). */
export async function grabAllFrames(): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (const d of screen.getAllDisplays()) {
    try { frames.push(await grabDisplayFrame(d)); } catch { /* skip a display we can't read */ }
  }
  return frames;
}

/** Crop a frame to a CSS-pixel rectangle (converts to device pixels internally). */
export function cropFrame(frame: Frame, rectCss: { x: number; y: number; width: number; height: number }, filename = 'Region capture'): RawCapture {
  const sf = frame.scaleFactor;
  const cropped = frame.image.crop({
    x: Math.max(0, Math.round(rectCss.x * sf)),
    y: Math.max(0, Math.round(rectCss.y * sf)),
    width: Math.round(rectCss.width * sf),
    height: Math.round(rectCss.height * sf),
  });
  return persistImage(cropped, filename);
}

export function persistImage(img: Electron.NativeImage, filename: string): RawCapture {
  const id = randomUUID();
  const imagePath = join(imagesDir(), `${id}.png`);
  writeFileSync(imagePath, img.toPNG());
  return { id, imagePath, filename };
}

export function persistDataUrl(dataUrl: string, filename: string): RawCapture {
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) throw new Error('Annotated image is empty or invalid');
  return persistImage(img, filename);
}

export function persistRedactedImage(imagePath: string, boxes: RedactionBox[], filename: string): RawCapture {
  if (!boxes.length) throw new Error('No PII regions were located in the image');
  const png = PNG.sync.read(readFileSync(imagePath));
  for (const box of boxes) {
    const x0 = clamp(Math.floor(box.x0) - 4, 0, png.width);
    const y0 = clamp(Math.floor(box.y0) - 4, 0, png.height);
    const x1 = clamp(Math.ceil(box.x1) + 4, 0, png.width);
    const y1 = clamp(Math.ceil(box.y1) + 4, 0, png.height);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = (png.width * y + x) * 4;
        png.data[idx] = 17;
        png.data[idx + 1] = 17;
        png.data[idx + 2] = 17;
        png.data[idx + 3] = 255;
      }
    }
  }
  return persistImage(nativeImage.createFromBuffer(PNG.sync.write(png)), filename);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function stitchPanorama(images: Electron.NativeImage[]): StitchResult {
  const pngs = images
    .map(img => PNG.sync.read(img.toPNG()))
    .filter(png => png.width > 0 && png.height > 0);
  if (!pngs.length) throw new Error('No frames captured for scrolling capture');

  const warnings: string[] = [];
  const width = Math.min(...pngs.map(png => png.width));
  const overlapResults: Array<{ overlap: number; score: number; reliable: boolean }> = [];
  for (let i = 1; i < pngs.length; i += 1) {
    const result = findOverlap(pngs[i - 1], pngs[i], width);
    overlapResults.push(result);
    if (!result.reliable) warnings.push(`Low-confidence alignment between frames ${i} and ${i + 1}; appended with minimal dedupe.`);
  }

  const height = pngs[0].height + pngs.slice(1).reduce((sum, png, idx) => sum + Math.max(1, png.height - overlapResults[idx].overlap), 0);
  const out = new PNG({ width, height, colorType: 6 });
  out.data.fill(255);

  let yOffset = 0;
  copyRows(pngs[0], out, 0, yOffset, pngs[0].height, width);
  yOffset += pngs[0].height;

  for (let i = 1; i < pngs.length; i += 1) {
    const overlap = overlapResults[i - 1].overlap;
    const copyHeight = Math.max(1, pngs[i].height - overlap);
    copyRows(pngs[i], out, overlap, yOffset, copyHeight, width);
    yOffset += copyHeight;
  }

  const reliable = overlapResults.filter(r => r.reliable);
  const confidence = overlapResults.length
    ? Math.round((overlapResults.reduce((sum, r) => sum + scoreToConfidence(r.score, r.reliable), 0) / overlapResults.length) * 100) / 100
    : 1;
  if (!reliable.length && pngs.length > 1) warnings.push('No strong overlaps found; result may include duplicate bands.');

  return {
    image: nativeImage.createFromBuffer(PNG.sync.write(out)),
    confidence,
    frameCount: pngs.length,
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
