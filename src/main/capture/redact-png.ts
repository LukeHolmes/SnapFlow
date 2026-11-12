import type { PNG } from 'pngjs';
import type { RedactionBox } from '../../shared/types';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Paint solid #111111 boxes over sensitive regions (device pixels). */
export function redactBoxesOnPng(png: PNG, boxes: RedactionBox[]): void {
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
}
