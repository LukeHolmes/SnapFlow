// Pixel-level diff using pngjs (pure JS, no native compilation) + pixelmatch.
// Runs synchronously in the main process — fast enough for typical screenshot sizes.
// The visual diff image is amber highlights on a faded "before", making it easy to
// spot changes at a glance. The AI summary (separate IPC call) provides the semantic
// analysis (what was added/removed/modified).
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DiffResult {
  diffImagePath: string;
  changedPixels: number;
  totalPixels: number;
  /** 0–100, two decimal places. */
  changePercent: number;
  width: number;
  height: number;
}

/** Extract the top-left sub-region of a PNG's raw RGBA buffer (no resize — preserves sharpness). */
function crop(src: PNG, w: number, h: number): Buffer {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    src.data.copy(out, y * w * 4, y * src.width * 4, y * src.width * 4 + w * 4);
  }
  return out;
}

export function computeDiff(beforePath: string, afterPath: string, outputPath: string): DiffResult {
  const before = PNG.sync.read(readFileSync(beforePath));
  const after  = PNG.sync.read(readFileSync(afterPath));

  // Always compare within the shared top-left region so mismatched viewports don't crash.
  const width  = Math.min(before.width,  after.width);
  const height = Math.min(before.height, after.height);
  const pixA = (before.width === width && before.height === height) ? before.data : crop(before, width, height);
  const pixB = (after.width  === width && after.height  === height) ? after.data  : crop(after,  width, height);

  const diffData = Buffer.alloc(width * height * 4);

  const changed = pixelmatch(pixA, pixB, diffData, width, height, {
    threshold: 0.1,    // tolerance — filters out sub-pixel anti-aliasing differences
    includeAA: false,  // skip anti-aliased edge pixels (reduces noise in UI screenshots)
    diffColor: [251, 146, 60],  // amber (#FB923C) — matches the SnapFlow design token
    alpha: 0.2,        // unchanged pixels at 20% opacity so context is visible but not distracting
  });

  const diffPng = new PNG({ width, height });
  diffData.copy(diffPng.data);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, PNG.sync.write(diffPng));

  return {
    diffImagePath: outputPath,
    changedPixels: changed,
    totalPixels: width * height,
    changePercent: +((changed / (width * height)) * 100).toFixed(2),
    width, height,
  };
}
