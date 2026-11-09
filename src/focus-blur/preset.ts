import type { Preset } from '../shared/types';
import type { FocusBlurEffect } from '../shared/types';
import { defaultWindowFocusRegion } from './model';

export const PRESET_FOCUS_BLUR_KEY = 'focusBlurAuto';

export interface PresetFocusBlurConfig {
  enabled?: boolean;
  /** When true, use an inset window rect if the capture has no saved focus regions. */
  windowFocus?: boolean;
  blurRadius?: number;
  dimAmount?: number;
  invert?: boolean;
}

export function presetFocusBlurConfig(config: Record<string, unknown>): PresetFocusBlurConfig {
  const raw = config[PRESET_FOCUS_BLUR_KEY];
  if (!raw || typeof raw !== 'object') return {};
  return raw as PresetFocusBlurConfig;
}

export function presetRequestsFocusBlur(preset: Preset): boolean {
  return !!presetFocusBlurConfig(preset.config).enabled;
}

export function mergePresetFocusBlur(
  saved: FocusBlurEffect | null | undefined,
  preset: Preset,
  imageWidth: number,
  imageHeight: number,
): FocusBlurEffect | null {
  const cfg = presetFocusBlurConfig(preset.config);
  if (!cfg.enabled) return saved?.regions.length ? saved : null;

  const base = saved ?? { regions: [], blurRadius: 12, dimAmount: 0.35, invert: false };
  const regions = base.regions.length
    ? base.regions
    : cfg.windowFocus !== false
      ? [defaultWindowFocusRegion(imageWidth, imageHeight)]
      : [];

  if (!regions.length) return null;

  return {
    regions,
    blurRadius: cfg.blurRadius ?? base.blurRadius,
    dimAmount: cfg.dimAmount ?? base.dimAmount,
    invert: cfg.invert ?? base.invert,
  };
}
