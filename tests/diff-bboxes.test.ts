import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeMask, extractChangedRegions } from '../src/main/diff/bboxes';

const W = 20;
const H = 10;

function rgbaBuffers(): { a: Buffer; b: Buffer } {
  const a = Buffer.alloc(W * H * 4, 0);
  const b = Buffer.alloc(W * H * 4, 0);
  for (let i = 0; i < W * H; i++) {
    a[i * 4 + 3] = 255;
    b[i * 4 + 3] = 255;
  }
  // right half of b is white; left stays black like a
  for (let y = 0; y < H; y++) {
    for (let x = W / 2; x < W; x++) {
      const i = (y * W + x) * 4;
      b[i] = b[i + 1] = b[i + 2] = 255;
    }
  }
  return { a, b };
}

test('extractChangedRegions → single box on right half', () => {
  const { a, b } = rgbaBuffers();
  const mask = buildChangeMask(a, b, W, H, 0.1);
  const regions = extractChangedRegions(mask, W, H, 4);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].x >= W / 2 - 1);
  assert.ok(regions[0].width >= W / 2 - 2);
});

test('buildChangeMask respects threshold', () => {
  const { a, b } = rgbaBuffers();
  const strict = buildChangeMask(a, b, W, H, 0.01);
  const loose = buildChangeMask(a, b, W, H, 0.5);
  const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
  assert.ok(count(strict) >= count(loose));
});
