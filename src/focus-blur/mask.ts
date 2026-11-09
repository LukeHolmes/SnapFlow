import type { FocusBlurEffect, FocusBlurRegion } from '../shared/types';
import { normaliseFocusBlur } from './model';

/** True when the pixel stays sharp (inside focus regions when not inverted). */
export function isSharpPixel(x: number, y: number, effect: FocusBlurEffect): boolean {
  const { regions, invert } = normaliseFocusBlur(effect);
  const inside = regions.some(r => pointInRegion(x + 0.5, y + 0.5, r));
  return invert ? !inside : inside;
}

export function buildSharpMask(width: number, height: number, effect: FocusBlurEffect): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = isSharpPixel(x, y, effect) ? 1 : 0;
    }
  }
  return mask;
}

export function pointInRegion(px: number, py: number, region: FocusBlurRegion): boolean {
  const { x, y, width, height, cornerRadius: r0 } = region;
  if (px < x || py < y || px > x + width || py > y + height) return false;
  const r = Math.min(r0 ?? 0, width / 2, height / 2);
  if (r <= 0) return true;

  const right = x + width;
  const bottom = y + height;

  const inTopLeft = px < x + r && py < y + r;
  const inTopRight = px > right - r && py < y + r;
  const inBottomLeft = px < x + r && py > bottom - r;
  const inBottomRight = px > right - r && py > bottom - r;

  if (inTopLeft) return dist(px, py, x + r, y + r) <= r;
  if (inTopRight) return dist(px, py, right - r, y + r) <= r;
  if (inBottomLeft) return dist(px, py, x + r, bottom - r) <= r;
  if (inBottomRight) return dist(px, py, right - r, bottom - r) <= r;
  return true;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
