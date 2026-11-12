// OCR pipeline (architecture §4.3). Tesseract via tesseract.js (WASM, on-device,
// offline with bundled eng.traineddata). One reusable worker runs off the UI thread
// in the main process.

import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;

function tessLangPath(): string {
  const candidates = [
    join(process.resourcesPath, 'tesseract'),
    join(app.getAppPath(), 'resources', 'tesseract'),
  ];
  for (const path of candidates) {
    if (existsSync(join(path, 'eng.traineddata'))) return path;
  }
  return candidates[1];
}

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng', 1, {
      langPath: tessLangPath(),
      cachePath: join(app.getPath('userData'), 'tesseract-cache'),
      gzip: false,
    });
  }
  return worker;
}

export interface OcrResult {
  text: string;
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

export async function runOcr(imagePath: string): Promise<OcrResult> {
  const w = await getWorker();
  const { data } = await w.recognize(imagePath);
  const words = (data.words ?? []).map((x: { text: string; bbox: OcrResult['words'][0]['bbox'] }) => ({ text: x.text, bbox: x.bbox }));
  return { text: (data.text ?? '').trim(), words };
}

export async function disposeOcr(): Promise<void> {
  if (worker) { await worker.terminate(); worker = null; }
}

/** Path used for bundled language data (tests assert offline behaviour). */
export function bundledTessLangPath(): string {
  return tessLangPath();
}
