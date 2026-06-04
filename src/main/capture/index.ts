// Capture engine (architecture §4.2). Exposed behind a deliberately NARROW interface
// so it can later be swapped for a native sidecar WITHOUT touching anything upstream.
// v0.x implementation uses Electron's desktopCapturer (cross-platform, zero native build).

import { desktopCapturer, screen, nativeImage } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { imagesDir } from '../paths';
import type { CaptureSource } from '../../shared/types';

export interface RawCapture { id: string; imagePath: string; filename: string; }

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

/** Full-resolution capture of a source (window or screen), at the best available resolution. */
export async function captureSource(sourceId?: string, filename?: string): Promise<RawCapture> {
  const displays = screen.getAllDisplays();
  const maxW = Math.max(...displays.map(d => deviceBox(d).w));
  const maxH = Math.max(...displays.map(d => deviceBox(d).h));
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: maxW, height: maxH } });
  const src = (sourceId && sources.find(s => s.id === sourceId)) || sources[0];
  if (!src) throw new Error('No capture source available (check screen-recording permission)');
  return persistImage(src.thumbnail, filename || src.name || 'Capture');
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
