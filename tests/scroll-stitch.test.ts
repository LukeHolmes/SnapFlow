import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { stitchScrollFrames } from '../src/main/capture/stitch';

const W = 120;

function solidBand(height: number, r: number, g: number, b: number, topStripe?: { y0: number; y1: number; r: number; g: number; b: number }): PNG {
  const png = new PNG({ width: W, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  if (topStripe) {
    for (let y = topStripe.y0; y < topStripe.y1; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        png.data[i] = topStripe.r;
        png.data[i + 1] = topStripe.g;
        png.data[i + 2] = topStripe.b;
      }
    }
  }
  return png;
}

test('stitchScrollFrames dedupes a shared overlap band between frames', () => {
  const overlap = 40;
  const unique = 80;
  const frame1 = solidBand(unique + overlap, 30, 120, 200);
  const frame2 = solidBand(unique + overlap, 30, 120, 200, { y0: 0, y1: overlap, r: 30, g: 120, b: 200 });

  const result = stitchScrollFrames([frame1, frame2]);
  assert.equal(result.frameCount, 2);
  assert.ok(result.confidence > 0.6, `expected high confidence, got ${result.confidence}`);
  assert.equal(result.width, W);
  assert.ok(result.height < frame1.height + frame2.height, 'stitched height should be shorter than naive concat');
  assert.ok(result.height >= unique + unique, 'stitched height should keep unique content from both frames');
  assert.equal(result.warnings.length, 0);
});

test('stitchScrollFrames warns when overlaps are unreliable', () => {
  const frame1 = solidBand(100, 11, 22, 33);
  const frame2 = solidBand(100, 200, 80, 10);

  const result = stitchScrollFrames([frame1, frame2]);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.confidence < 0.6);
});

test('stitchScrollFrames rejects empty input', () => {
  assert.throws(() => stitchScrollFrames([]), /No frames captured/);
});
