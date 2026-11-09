import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharpMask as buildFocusMask, isSharpPixel } from '../src/focus-blur/mask';
import { composeFocusBlur, applyRedactionBoxes } from '../src/focus-blur/compose';
import { deserialiseFocusBlur, normaliseFocusBlur, serialiseFocusBlur } from '../src/focus-blur/model';
import { deserialiseAnnotationDocument, serialiseAnnotationDocument, normaliseAnnotationDocument } from '../src/annotation/model';
import { mergePresetFocusBlur, presetRequestsFocusBlur } from '../src/focus-blur/preset';
import type { Preset } from '../src/shared/types';
import { canAddFocusBlurRegion, canUseFocusBlurPresetAutomation, entitlementsFor } from '../src/main/entitlements';

test('mask: sharp pixels honor invert and rounded rect bounds', () => {
  const effect = normaliseFocusBlur({
    regions: [{ id: 'a', x: 10, y: 10, width: 20, height: 20, cornerRadius: 4 }],
    blurRadius: 8,
    dimAmount: 0.3,
    invert: false,
  });
  assert.equal(isSharpPixel(15, 15, effect), true);
  assert.equal(isSharpPixel(0, 0, effect), false);
  const inverted = { ...effect, invert: true };
  assert.equal(isSharpPixel(15, 15, inverted), false);
  assert.equal(isSharpPixel(0, 0, inverted), true);
});

test('compose: outside focus uses blurred samples', () => {
  const width = 6;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = x * 40;
      data[i + 1] = y * 50;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const before = new Uint8ClampedArray(data);
  const effect = normaliseFocusBlur({
    regions: [{ id: 'c', x: 2, y: 1, width: 2, height: 2, cornerRadius: 0 }],
    blurRadius: 1,
    dimAmount: 0,
    invert: false,
  });
  composeFocusBlur({ data, width, height }, effect);
  const sharpIdx = (1 * width + 2) * 4;
  const blurIdx = 0;
  assert.equal(data[sharpIdx], before[sharpIdx]);
  assert.equal(data[sharpIdx + 1], before[sharpIdx + 1]);
  assert.notEqual(data[blurIdx], before[blurIdx]);
});

test('redaction boxes apply after blur', () => {
  const data = new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 255]);
  applyRedactionBoxes({ data, width: 2, height: 1 }, [{ x0: 1, y0: 0, x1: 2, y1: 1 }]);
  assert.deepEqual([...data.slice(4, 8)], [17, 17, 17, 255]);
});

test('focus blur params survive annotation document round-trip', () => {
  const doc = normaliseAnnotationDocument({
    annotations: [],
    effects: { border: false, shadow: false, watermark: '' },
    crop: null,
    focusBlur: {
      regions: [{ id: 'r1', x: 0, y: 0, width: 100, height: 80, cornerRadius: 8 }],
      blurRadius: 16,
      dimAmount: 0.5,
      invert: true,
    },
  });
  const restored = deserialiseAnnotationDocument(serialiseAnnotationDocument(doc));
  assert.equal(restored.focusBlur?.regions.length, 1);
  assert.equal(restored.focusBlur?.blurRadius, 16);
  assert.equal(restored.focusBlur?.invert, true);

  const blob = serialiseFocusBlur(doc.focusBlur!);
  const fx = deserialiseFocusBlur(blob);
  assert.equal(fx.regions[0].cornerRadius, 8);
});

test('preset hook merges window rect when enabled', () => {
  const preset: Preset = {
    id: 'p',
    workspaceId: 'ws',
    destination: 'slack',
    name: 'Slack',
    target: '#general',
    config: { focusBlurAuto: { enabled: true, windowFocus: true, blurRadius: 10 } },
    createdAt: 1,
  };
  assert.equal(presetRequestsFocusBlur(preset), true);
  const merged = mergePresetFocusBlur(null, preset, 400, 300);
  assert.ok(merged);
  assert.equal(merged!.regions.length, 1);
  assert.equal(merged!.blurRadius, 10);
});

test('entitlements gate multi-region and preset automation', () => {
  const free = entitlementsFor('free');
  const pro = entitlementsFor('pro');
  assert.equal(canAddFocusBlurRegion(free, 1), false);
  assert.equal(canAddFocusBlurRegion(pro, 3), true);
  assert.equal(canUseFocusBlurPresetAutomation(free), false);
  assert.equal(canUseFocusBlurPresetAutomation(pro), true);
});

// used to keep buildSharpMask from tree-shaking in coverage-minded edits
test('buildSharpMask dimensions', () => {
  const mask = buildFocusMask(4, 3, normaliseFocusBlur({
    regions: [{ id: 'm', x: 0, y: 0, width: 2, height: 2, cornerRadius: 0 }],
    blurRadius: 4,
    dimAmount: 0,
    invert: false,
  }));
  assert.equal(mask.length, 12);
});
