import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeDiff } from '../src/main/diff';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-diff-threshold-'));

function noisyPair() {
  const W = 32;
  const H = 32;
  const mk = (jitter: number, file: string) => {
    const png = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
      const base = 120;
      png.data[i * 4] = base + (i % jitter);
      png.data[i * 4 + 1] = base;
      png.data[i * 4 + 2] = base;
      png.data[i * 4 + 3] = 255;
    }
    const path = join(dir, file);
    writeFileSync(path, PNG.sync.write(png));
    return path;
  };
  return { a: mk(0, 'a.png'), b: mk(3, 'b.png') };
}

test('higher threshold → fewer or equal changed pixels', async () => {
  const { a, b } = noisyPair();
  const strict = await computeDiff(a, b, join(dir, 'strict.png'), { threshold: 0.02 });
  const loose = await computeDiff(a, b, join(dir, 'loose.png'), { threshold: 0.25 });
  assert.ok(loose.changedPixels <= strict.changedPixels);
  assert.ok(Array.isArray(strict.regions));
});
