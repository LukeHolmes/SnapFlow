// Colour conversion/formatting — headless-safe (no Electron).

export type ColorFormat = 'hex' | 'rgb' | 'hsl';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface SampledColor extends RgbColor {
  hex: string;
  hsl: { h: number; s: number; l: number };
}

export function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const to = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): RgbColor | null {
  const norm = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(norm)) return null;
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}

export function rgbToHsl({ r, g, b }: RgbColor): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    default: h = ((rn - gn) / d + 4) / 6; break;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function toSampledColor(rgb: RgbColor): SampledColor {
  return { ...rgb, hex: rgbToHex(rgb), hsl: rgbToHsl(rgb) };
}

export function formatColor(sample: Pick<SampledColor, 'r' | 'g' | 'b' | 'hex' | 'hsl'>, format: ColorFormat): string {
  switch (format) {
    case 'rgb':
      return `rgb(${sample.r}, ${sample.g}, ${sample.b})`;
    case 'hsl':
      return `hsl(${sample.hsl.h}, ${sample.hsl.s}%, ${sample.hsl.l}%)`;
    default:
      return sample.hex;
  }
}
