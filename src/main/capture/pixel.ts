// Pixel sampling from capture frames — stays in capture/ with no integration deps.

import type { NativeImage } from 'electron';
import { toSampledColor, type RgbColor, type SampledColor } from '../../shared/color';
import type { Frame } from './index';

const LOUPE_CSS_PX = 15;

export interface FrameSample {
  cssX: number;
  cssY: number;
  color: SampledColor;
  loupeDataUrl: string;
}

function readBgraPixel(image: NativeImage, deviceX: number, deviceY: number): RgbColor {
  const { width, height } = image.getSize();
  const x = Math.max(0, Math.min(width - 1, deviceX));
  const y = Math.max(0, Math.min(height - 1, deviceY));
  const bmp = image.toBitmap();
  const idx = (y * width + x) * 4;
  return { r: bmp[idx + 2] ?? 0, g: bmp[idx + 1] ?? 0, b: bmp[idx] ?? 0 };
}

/** Sample the pixel under a CSS coordinate on a frozen display frame (HiDPI-aware). */
export function sampleFrameAt(frame: Frame, cssX: number, cssY: number): FrameSample {
  const sf = frame.scaleFactor;
  const cx = Math.max(0, Math.min(frame.cssWidth - 1, cssX));
  const cy = Math.max(0, Math.min(frame.cssHeight - 1, cssY));
  const dx = Math.round(cx * sf);
  const dy = Math.round(cy * sf);
  const half = Math.floor(LOUPE_CSS_PX / 2);
  const loupeW = LOUPE_CSS_PX * sf;
  const loupeH = LOUPE_CSS_PX * sf;
  const cropX = Math.max(0, Math.min(frame.image.getSize().width - loupeW, dx - half * sf));
  const cropY = Math.max(0, Math.min(frame.image.getSize().height - loupeH, dy - half * sf));
  const loupe = frame.image.crop({ x: cropX, y: cropY, width: loupeW, height: loupeH });
  return {
    cssX: cx,
    cssY: cy,
    color: toSampledColor(readBgraPixel(frame.image, dx, dy)),
    loupeDataUrl: loupe.toDataURL(),
  };
}
