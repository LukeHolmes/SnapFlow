import { readFileSync } from 'node:fs';
import { nativeImage } from 'electron';
import { PNG } from 'pngjs';
import type { FocusBlurEffect, RedactionBox } from '../../shared/types';
import { composeFocusBlur, applyRedactionBoxes } from '../../focus-blur/compose';
import { hasActiveFocusBlur } from '../../focus-blur/model';
import { persistImage, type RawCapture } from './index';

export function renderFocusBlurPng(
  imagePath: string,
  effect: FocusBlurEffect,
  redactionBoxes: RedactionBox[] = [],
): Buffer {
  const png = PNG.sync.read(readFileSync(imagePath));
  const data = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  if (hasActiveFocusBlur(effect)) {
    composeFocusBlur({ data, width: png.width, height: png.height }, effect);
  }
  if (redactionBoxes.length) {
    applyRedactionBoxes({ data, width: png.width, height: png.height }, redactionBoxes);
  }
  const out = new PNG({ width: png.width, height: png.height });
  out.data = Buffer.from(data);
  return PNG.sync.write(out);
}

export function persistFocusBlurImage(
  imagePath: string,
  effect: FocusBlurEffect,
  redactionBoxes: RedactionBox[],
  filename: string,
): RawCapture {
  const buf = renderFocusBlurPng(imagePath, effect, redactionBoxes);
  return persistImage(nativeImage.createFromBuffer(buf), filename);
}
