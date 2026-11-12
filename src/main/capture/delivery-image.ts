import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import type { AnnotationDocument, Capture, FocusBlurEffect, Preset } from '../../shared/types';
import { mergePresetFocusBlur, presetRequestsFocusBlur } from '../../focus-blur/preset';
import { hasActiveFocusBlur, normaliseFocusBlur } from '../../focus-blur/model';
import { boxesForDetections, locatePiiInOcr } from '../ai/pii-locate';
import { runOcr } from '../ocr';
import { renderFocusBlurPng } from './focus-blur-export';
import { imagesDir } from '../paths';
import type { Entitlements } from '../../shared/types';
import { canUseFocusBlurPresetAutomation } from '../entitlements';

export interface DeliveryImageOptions {
  entitlements: Entitlements;
  annotationDoc: AnnotationDocument | null;
  preset?: Preset | null;
  /** When true, burn detected PII boxes after focus blur. */
  applyPiiRedaction?: boolean;
}

export async function buildDeliveryImagePath(
  capture: Capture,
  options: DeliveryImageOptions,
): Promise<{ imagePath: string; temporary: boolean; piiRedacted: boolean }> {
  const png = PNG.sync.read(readFileSync(capture.imagePath));
  let effect: FocusBlurEffect | null = normaliseFocusBlur(options.annotationDoc?.focusBlur);
  if (!hasActiveFocusBlur(effect) && options.preset && presetRequestsFocusBlur(options.preset)) {
    if (!canUseFocusBlurPresetAutomation(options.entitlements)) {
      effect = null;
    } else {
      effect = mergePresetFocusBlur(effect, options.preset, png.width, png.height);
    }
  }

  let redactionBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  if (options.applyPiiRedaction !== false) {
    const ocr = await runOcr(capture.imagePath);
    const detections = locatePiiInOcr(ocr);
    if (detections.length) {
      redactionBoxes = boxesForDetections(detections, detections.map(d => d.id));
    }
  }

  const needsRender = (effect && hasActiveFocusBlur(effect)) || redactionBoxes.length > 0;
  if (!needsRender) {
    return { imagePath: capture.imagePath, temporary: false, piiRedacted: !!capture.piiRedactedApplied };
  }

  const buf = renderFocusBlurPng(
    capture.imagePath,
    effect && hasActiveFocusBlur(effect) ? effect : { regions: [], blurRadius: 0, dimAmount: 0, invert: false },
    redactionBoxes,
  );
  const tempPath = join(imagesDir(), `delivery_${randomUUID()}.png`);
  writeFileSync(tempPath, buf);
  return { imagePath: tempPath, temporary: true, piiRedacted: redactionBoxes.length > 0 || !!capture.piiRedactedApplied };
}

export function disposeDeliveryImage(path: string, temporary: boolean): void {
  if (temporary) {
    try { unlinkSync(path); } catch { /* best-effort */ }
  }
}
