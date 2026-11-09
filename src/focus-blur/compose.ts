import type { FocusBlurEffect, RedactionBox } from '../shared/types';
import { boxBlurRgba } from './box-blur';
import { isSharpPixel } from './mask';
import { normaliseFocusBlur } from './model';

export interface RgbaSurface {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Non-destructive focus blur: sharp inside regions (unless invert), blurred + dim outside. */
export function composeFocusBlur(surface: RgbaSurface, effect: FocusBlurEffect): RgbaSurface {
  const fx = normaliseFocusBlur(effect);
  if (!fx.regions.length) return surface;

  const { width, height } = surface;
  const original = new Uint8ClampedArray(surface.data);
  const blurred = new Uint8ClampedArray(surface.data);
  const radius = Math.max(1, Math.round(fx.blurRadius));
  boxBlurRgba(blurred, width, height, radius);

  const out = surface.data;
  const dim = fx.dimAmount;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const sharp = isSharpPixel(x, y, fx);
      if (sharp) {
        out[i] = original[i];
        out[i + 1] = original[i + 1];
        out[i + 2] = original[i + 2];
        out[i + 3] = original[i + 3];
      } else {
        out[i] = blurred[i];
        out[i + 1] = blurred[i + 1];
        out[i + 2] = blurred[i + 2];
        if (dim > 0) {
          out[i] = Math.round(out[i] * (1 - dim));
          out[i + 1] = Math.round(out[i + 1] * (1 - dim));
          out[i + 2] = Math.round(out[i + 2] * (1 - dim));
        }
        out[i + 3] = original[i + 3];
      }
    }
  }
  return surface;
}

/** PII redactions are burned in after blur so they always win. */
export function applyRedactionBoxes(surface: RgbaSurface, boxes: RedactionBox[]): void {
  const { data, width, height } = surface;
  for (const box of boxes) {
    const x0 = clamp(Math.floor(box.x0) - 4, 0, width);
    const y0 = clamp(Math.floor(box.y0) - 4, 0, height);
    const x1 = clamp(Math.ceil(box.x1) + 4, 0, width);
    const y1 = clamp(Math.ceil(box.y1) + 4, 0, height);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = (width * y + x) * 4;
        data[idx] = 17;
        data[idx + 1] = 17;
        data[idx + 2] = 17;
        data[idx + 3] = 255;
      }
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
