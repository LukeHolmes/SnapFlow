import type { FocusBlurEffect, FocusBlurRegion } from '../shared/types';

export const DEFAULT_FOCUS_BLUR: FocusBlurEffect = {
  regions: [],
  blurRadius: 12,
  dimAmount: 0.35,
  invert: false,
};

export function emptyFocusBlur(): FocusBlurEffect {
  return { ...DEFAULT_FOCUS_BLUR, regions: [] };
}

export function normaliseRegion(region: FocusBlurRegion): FocusBlurRegion {
  const w = Math.abs(region.width);
  const h = Math.abs(region.height);
  const x = region.width < 0 ? region.x + region.width : region.x;
  const y = region.height < 0 ? region.y + region.height : region.y;
  const cornerRadius = Math.max(0, Math.min(region.cornerRadius ?? 0, Math.min(w, h) / 2));
  return { ...region, x, y, width: Math.max(1, w), height: Math.max(1, h), cornerRadius };
}

export function normaliseFocusBlur(effect: FocusBlurEffect | null | undefined): FocusBlurEffect {
  if (!effect) return emptyFocusBlur();
  const blurRadius = clamp(Math.round(effect.blurRadius ?? DEFAULT_FOCUS_BLUR.blurRadius), 0, 48);
  const dimAmount = clamp(Number(effect.dimAmount ?? DEFAULT_FOCUS_BLUR.dimAmount), 0, 0.85);
  return {
    regions: (effect.regions ?? []).map(normaliseRegion),
    blurRadius,
    dimAmount,
    invert: !!effect.invert,
  };
}

export function hasActiveFocusBlur(effect: FocusBlurEffect | null | undefined): boolean {
  return normaliseFocusBlur(effect).regions.length > 0;
}

export function serialiseFocusBlur(effect: FocusBlurEffect): string {
  return JSON.stringify(normaliseFocusBlur(effect));
}

export function deserialiseFocusBlur(json: string): FocusBlurEffect {
  return normaliseFocusBlur(JSON.parse(json) as FocusBlurEffect);
}

/** Pro automation: inset focus rect when preset has no saved regions on the capture. */
export function defaultWindowFocusRegion(width: number, height: number, insetPct = 0.12): FocusBlurRegion {
  const insetX = Math.round(width * insetPct);
  const insetY = Math.round(height * insetPct);
  return {
    id: 'preset-window',
    x: insetX,
    y: insetY,
    width: Math.max(32, width - insetX * 2),
    height: Math.max(32, height - insetY * 2),
    cornerRadius: Math.round(Math.min(width, height) * 0.04),
  };
}

export function regionFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cornerRadius = 0,
): FocusBlurRegion {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return normaliseRegion({
    id: randomId(),
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    cornerRadius,
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fbr_${Math.random().toString(36).slice(2)}`;
}
