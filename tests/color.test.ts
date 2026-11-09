import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatColor, hexToRgb, rgbToHex, rgbToHsl, toSampledColor } from '../src/shared/color';

test('rgbToHex uppercases and pads', () => {
  assert.equal(rgbToHex({ r: 79, g: 70, b: 229 }), '#4F46E5');
  assert.equal(rgbToHex({ r: 0, g: 15, b: 255 }), '#000FFF');
});

test('hexToRgb rejects invalid values', () => {
  assert.equal(hexToRgb('#abc'), null);
  assert.deepEqual(hexToRgb('#4f46e5'), { r: 79, g: 70, b: 229 });
});

test('rgbToHsl known anchors', () => {
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  const gray = rgbToHsl({ r: 128, g: 128, b: 128 });
  assert.equal(gray.s, 0);
  assert.equal(gray.l, 50);
});

test('formatColor respects clipboard format', () => {
  const sample = toSampledColor({ r: 79, g: 70, b: 229 });
  assert.equal(formatColor(sample, 'hex'), '#4F46E5');
  assert.equal(formatColor(sample, 'rgb'), 'rgb(79, 70, 229)');
  assert.equal(formatColor(sample, 'hsl'), 'hsl(243, 75%, 59%)');
});
