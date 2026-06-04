// OCR pipeline (architecture §4.3). Tesseract via tesseract.js (WASM, on-device,
// offline after first-run language download). One reusable worker, runs off the
// UI thread in the main process. Image-region word boxes are returned best-effort
// so a later step can blur PII regions on the pixels themselves.

import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) worker = await createWorker('eng');
  return worker;
}

export interface OcrResult {
  text: string;
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

export async function runOcr(imagePath: string): Promise<OcrResult> {
  const w = await getWorker();
  const { data } = await w.recognize(imagePath);
  const words = (data.words ?? []).map((x: any) => ({ text: x.text, bbox: x.bbox }));
  return { text: (data.text ?? '').trim(), words };
}

export async function disposeOcr(): Promise<void> {
  if (worker) { await worker.terminate(); worker = null; }
}
