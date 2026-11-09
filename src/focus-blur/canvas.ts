import type { FocusBlurEffect, FocusBlurRegion } from '../shared/types';
import { composeFocusBlur } from './compose';
import { normaliseFocusBlur } from './model';

export function paintFocusBlurPreview(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  effect: FocusBlurEffect,
  regionsOverlay?: FocusBlurRegion[],
  selectedId?: string | null,
): void {
  ctx.drawImage(source, 0, 0, width, height);
  const fx = normaliseFocusBlur(effect);
  if (fx.regions.length) {
    const imageData = ctx.getImageData(0, 0, width, height);
    composeFocusBlur({ data: imageData.data, width, height }, fx);
    ctx.putImageData(imageData, 0, 0);
  }
  const overlay = regionsOverlay ?? fx.regions;
  for (const region of overlay) {
    drawRegionChrome(ctx, region, region.id === selectedId);
  }
}

export function exportFocusBlurDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  effect: FocusBlurEffect,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  paintFocusBlurPreview(ctx, source, width, height, effect);
  return canvas.toDataURL('image/png');
}

function drawRegionChrome(ctx: CanvasRenderingContext2D, region: FocusBlurRegion, selected: boolean): void {
  const { x, y, width, height, cornerRadius: r0 } = region;
  const r = Math.min(r0 ?? 0, width / 2, height / 2);
  ctx.save();
  ctx.strokeStyle = selected ? '#4F46E5' : 'rgba(255,255,255,.92)';
  ctx.lineWidth = selected ? 3 : 2;
  ctx.setLineDash(selected ? [6, 5] : []);
  roundRect(ctx, x, y, width, height, r);
  ctx.stroke();
  if (selected) {
    ctx.setLineDash([]);
    for (const [hx, hy] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#4F46E5';
      ctx.stroke();
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
