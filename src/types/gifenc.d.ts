declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame: (...args: unknown[]) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  export function quantize(data: Uint8ClampedArray, maxColors: number): number[][];
  export function applyPalette(data: Uint8ClampedArray, palette: number[][]): Uint8Array;
}
