// Extract axis-aligned bounding boxes from a per-pixel change mask (1 = changed).

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** Union-find connected components on a binary mask; returns boxes for each component ≥ minPixels. */
export function extractChangedRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels = 16,
): DiffRegion[] {
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const parent: number[] = [0];

  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const neighbours: number[] = [];
      if (x > 0 && mask[i - 1]) neighbours.push(labels[i - 1]);
      if (y > 0 && mask[i - width]) neighbours.push(labels[i - width]);
      if (neighbours.length === 0) {
        labels[i] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel += 1;
      } else {
        const root = neighbours.reduce((a, b) => (find(a) < find(b) ? a : b));
        labels[i] = root;
        for (const n of neighbours) unite(root, n);
      }
    }
  }

  const buckets = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const root = find(labels[i]);
      const b = buckets.get(root) ?? { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
      b.count += 1;
      buckets.set(root, b);
    }
  }

  const regions: DiffRegion[] = [];
  for (const b of buckets.values()) {
    if (b.count < minPixels) continue;
    regions.push({
      x: b.minX,
      y: b.minY,
      width: b.maxX - b.minX + 1,
      height: b.maxY - b.minY + 1,
    });
  }
  return regions.sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

/** Build a change mask from two RGBA buffers using the same distance threshold as pixelmatch (0–1). */
export function buildChangeMask(pixA: Buffer, pixB: Buffer, width: number, height: number, threshold: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const t = threshold * threshold * 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = pixA[i] - pixB[i];
      const dg = pixA[i + 1] - pixB[i + 1];
      const db = pixA[i + 2] - pixB[i + 2];
      if (dr * dr + dg * dg + db * db > t) mask[y * width + x] = 1;
    }
  }
  return mask;
}
