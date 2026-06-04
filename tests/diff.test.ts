// Tests for the pixel diff engine — uses real PNG buffers created with pngjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeDiff } from '../src/main/diff';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-diff-'));
const W = 64, H = 64;

/** Create a solid-colour PNG file and return its path. */
function solidPng(r: number, g: number, b: number, file: string): string {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4]     = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  const path = join(dir, file);
  writeFileSync(path, PNG.sync.write(png));
  return path;
}

/** Create a PNG with a half red, half blue split. */
function splitPng(file: string): string {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const isLeft = x < W / 2;
      png.data[i]     = isLeft ? 255 : 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = isLeft ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  const path = join(dir, file);
  writeFileSync(path, PNG.sync.write(png));
  return path;
}

test('identical images → 0 changed pixels', () => {
  const img = solidPng(200, 200, 200, 'grey.png');
  const out = join(dir, 'same-diff.png');
  const res = computeDiff(img, img, out);
  assert.equal(res.changedPixels, 0);
  assert.equal(res.changePercent, 0);
  assert.equal(res.width, W);
  assert.equal(res.height, H);
});

test('fully different images → many changed pixels', () => {
  const red   = solidPng(255, 0, 0, 'red.png');
  const blue  = solidPng(0, 0, 255, 'blue.png');
  const out   = join(dir, 'rb-diff.png');
  const res   = computeDiff(red, blue, out);
  assert.ok(res.changedPixels > W * H * 0.9, `Expected > 90% of pixels changed, got ${res.changePercent}%`);
});

test('partial change — right half of image changed', () => {
  // Left half: same grey in both. Right half: grey vs white → should detect right half as changed.
  const mkHalf = (leftR: number, rightR: number, file: string) => {
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = x < W / 2 ? leftR : rightR;
        png.data[i] = png.data[i+1] = png.data[i+2] = v; png.data[i+3] = 255;
      }
    }
    const path = join(dir, file); writeFileSync(path, PNG.sync.write(png)); return path;
  };
  const a = mkHalf(128, 128, 'half-a.png'); // all grey
  const b = mkHalf(128, 255, 'half-b.png'); // left grey, right white
  const res = computeDiff(a, b, join(dir, 'partial-diff.png'));
  assert.ok(res.changedPixels > 0, 'should detect some changed pixels');
  assert.ok(res.changePercent < 80, `right-half change should be < 80%, got ${res.changePercent}%`);
});

test('different-sized images → crops to intersection without throwing', () => {
  // 64×64 vs 32×32 — crops to 32×32
  const big   = solidPng(255, 0, 0, 'big.png');
  const small = join(dir, 'small.png');
  const smallPng = new PNG({ width: 32, height: 32 });
  for (let i = 0; i < 32 * 32; i++) { smallPng.data[i*4]=0; smallPng.data[i*4+1]=255; smallPng.data[i*4+2]=0; smallPng.data[i*4+3]=255; }
  writeFileSync(small, PNG.sync.write(smallPng));
  const out = join(dir, 'size-diff.png');
  const res = computeDiff(big, small, out);
  assert.equal(res.width, 32);
  assert.equal(res.height, 32);
  assert.ok(res.changedPixels > 0);
});

test('changePercent is correctly bounded 0–100', () => {
  const a = solidPng(100, 100, 100, 'aa.png');
  const b = solidPng(200, 200, 200, 'bb.png');
  const res = computeDiff(a, b, join(dir, 'bound-diff.png'));
  assert.ok(res.changePercent >= 0 && res.changePercent <= 100);
});
