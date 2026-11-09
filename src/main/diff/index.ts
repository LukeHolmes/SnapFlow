// Pixel-level diff using pngjs (pure JS, no native compilation) + pixelmatch.
// Runs in the main process; fast enough for typical screenshot sizes.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildChangeMask, extractChangedRegions, type DiffRegion } from './bboxes';
import { normaliseDiffOptions, type DiffComputeOptions } from './options';

export type { DiffRegion } from './bboxes';
export type { DiffComputeOptions } from './options';
export { extractChangedRegions, buildChangeMask } from './bboxes';
export { findPreviousCapture, captureBaseName } from './match';

export interface DiffResult {
  diffImagePath: string;
  changedPixels: number;
  totalPixels: number;
  /** 0–100, two decimal places. */
  changePercent: number;
  width: number;
  height: number;
  regions: DiffRegion[];
  threshold: number;
}

/** Extract the top-left sub-region of a PNG's raw RGBA buffer (no resize — preserves sharpness). */
function crop(src: PNG, w: number, h: number): Buffer {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    src.data.copy(out, y * w * 4, y * src.width * 4, y * src.width * 4 + w * 4);
  }
  return out;
}

type Pixelmatch = typeof import('pixelmatch').default;
let pixelmatchPromise: Promise<Pixelmatch> | null = null;

function loadPixelmatch(): Promise<Pixelmatch> {
  pixelmatchPromise ??= import('pixelmatch').then(mod => mod.default);
  return pixelmatchPromise;
}

export async function computeDiff(
  beforePath: string,
  afterPath: string,
  outputPath: string,
  options?: DiffComputeOptions,
): Promise<DiffResult> {
  const opts = normaliseDiffOptions(options);
  const before = PNG.sync.read(readFileSync(beforePath));
  const after = PNG.sync.read(readFileSync(afterPath));

  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const pixA = (before.width === width && before.height === height) ? before.data : crop(before, width, height);
  const pixB = (after.width === width && after.height === height) ? after.data : crop(after, width, height);

  const mask = buildChangeMask(pixA, pixB, width, height, opts.threshold);
  const regions = extractChangedRegions(mask, width, height);

  const diffData = Buffer.alloc(width * height * 4);
  const pixelmatch = await loadPixelmatch();

  const changed = pixelmatch(pixA, pixB, diffData, width, height, {
    threshold: opts.threshold,
    includeAA: opts.includeAA,
    diffColor: [251, 146, 60],
    alpha: opts.diffAlpha,
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
    width,
    height,
    regions,
    threshold: opts.threshold,
  };
}
