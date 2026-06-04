// Capture engine (architecture §4.2). Exposed behind a deliberately NARROW interface
// so it can later be swapped for a native sidecar WITHOUT touching anything upstream.
// v0.x implementation uses Electron's desktopCapturer (cross-platform, zero native build).

import { desktopCapturer, screen, nativeImage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { imagesDir } from '../paths';
import type { CaptureSource } from '../../shared/types';

export interface RawCapture { id: string; imagePath: string; filename: string; }
export interface RedactionBox { x0: number; y0: number; x1: number; y1: number; }

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
export async function captureScrollingSource(options: { sourceId?: string; frames?: number; intervalMs?: number } = {}): Promise<RawCapture> {
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

  return persistImage(stitchVertical(images), `${sourceName} scroll`);
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

function stitchVertical(images: Electron.NativeImage[]): Electron.NativeImage {
  const pngs = images
    .map(img => PNG.sync.read(img.toPNG()))
    .filter(png => png.width > 0 && png.height > 0);
  if (!pngs.length) throw new Error('No frames captured for scrolling capture');

  const width = Math.max(...pngs.map(png => png.width));
  const height = pngs.reduce((sum, png) => sum + png.height, 0);
  const out = new PNG({ width, height, colorType: 6 });
  out.data.fill(255);

  let yOffset = 0;
  for (const png of pngs) {
    for (let y = 0; y < png.height; y += 1) {
      const srcStart = y * png.width * 4;
      const destStart = ((yOffset + y) * width) * 4;
      png.data.copy(out.data, destStart, srcStart, srcStart + png.width * 4);
    }
    yOffset += png.height;
  }

  return nativeImage.createFromBuffer(PNG.sync.write(out));
}
