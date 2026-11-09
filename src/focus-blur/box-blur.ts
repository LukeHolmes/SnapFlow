/** Separable box blur on RGBA buffers (pure JS, no native deps). */

export function boxBlurRgba(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  if (radius <= 0 || width < 1 || height < 1) return;
  const size = width * height;
  const tmp = new Float32Array(size * 4);
  const window = radius * 2 + 1;

  for (let c = 0; c < 4; c += 1) {
  // horizontal
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) {
        const cx = clamp(x, 0, width - 1);
        sum += data[(y * width + cx) * 4 + c];
      }
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4 + c;
        tmp[idx] = sum / window;
        const removeX = clamp(x - radius, 0, width - 1);
        const addX = clamp(x + radius + 1, 0, width - 1);
        sum += data[(y * width + addX) * 4 + c] - data[(y * width + removeX) * 4 + c];
      }
    }
    // vertical
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) {
        const cy = clamp(y, 0, height - 1);
        sum += tmp[(cy * width + x) * 4 + c];
      }
      for (let y = 0; y < height; y += 1) {
        const idx = (y * width + x) * 4 + c;
        data[idx] = Math.round(sum / window);
        const removeY = clamp(y - radius, 0, height - 1);
        const addY = clamp(y + radius + 1, 0, height - 1);
        sum += tmp[(addY * width + x) * 4 + c] - tmp[(removeY * width + x) * 4 + c];
      }
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
