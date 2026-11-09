// Map detectPii() hits to OCR word bounding boxes for pixel redaction.

import { createHash } from 'node:crypto';
import type { OcrResult } from '../ocr';
import type { RedactionBox } from '../capture';
import { detectPii, isWordyNameHit, normalisePiiMatchValue, type PiiHit, type PiiType } from './pii';

export interface PiiDetection {
  id: string;
  type: PiiType;
  value: string;
  bbox: RedactionBox;
}

function detectionId(hit: PiiHit, bbox: RedactionBox): string {
  const key = `${hit.type}:${hit.value}:${Math.round(bbox.x0)}:${Math.round(bbox.y0)}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function mergeBox(a: RedactionBox | null, b: RedactionBox): RedactionBox {
  return a
    ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
    : { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
}

function locateHitInOcr(ocr: OcrResult, hit: PiiHit): RedactionBox | null {
  const hits = [normalisePiiMatchValue(hit.value)].filter(Boolean);
  if (!hits.length) return null;

  const words = ocr.words
    .filter(word => word.text?.trim() && word.bbox)
    .map(word => ({ ...word, norm: normalisePiiMatchValue(word.text) }))
    .filter(word => word.norm);

  const boxes: RedactionBox[] = [];
  const target = hits[0];
  const nameMode = hit.type === 'name' || isWordyNameHit(hit.value);
  const nameParts = nameMode ? hit.value.toLowerCase().split(/\s+/).map(p => p.replace(/[^a-z]/g, '')).filter(Boolean) : [];

  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    let box: RedactionBox | null = null;

    for (let end = start; end < Math.min(words.length, start + (nameMode ? 6 : 8)); end += 1) {
      const word = words[end];
      joined += word.norm;
      box = mergeBox(box, word.bbox);

      if (joined.includes(target) || target.includes(joined)) {
        if (box) boxes.push(box);
        break;
      }

      if (nameMode && nameParts.length) {
        const slice = words.slice(start, end + 1).map(w => w.norm);
        if (nameParts.every((part, i) => slice[i]?.includes(part) || part.includes(slice[i] ?? ''))) {
          if (box) boxes.push(box);
          break;
        }
      }

      if (joined.length > 96) break;
    }
  }

  return boxes[0] ?? null;
}

export function locatePiiInOcr(ocr: OcrResult): PiiDetection[] {
  const detections: PiiDetection[] = [];
  for (const hit of detectPii(ocr.text)) {
    const bbox = locateHitInOcr(ocr, hit);
    if (!bbox) continue;
    detections.push({ id: detectionId(hit, bbox), type: hit.type, value: hit.value, bbox });
  }
  return detections;
}

export function boxesForDetections(detections: PiiDetection[], selectedIds: string[]): RedactionBox[] {
  const selected = new Set(selectedIds);
  const boxes = detections.filter(d => selected.has(d.id)).map(d => d.bbox);
  return dedupeBoxes(boxes);
}

function dedupeBoxes(boxes: RedactionBox[]): RedactionBox[] {
  const seen = new Set<string>();
  return boxes.filter(box => {
    const key = `${Math.round(box.x0)}:${Math.round(box.y0)}:${Math.round(box.x1)}:${Math.round(box.y1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
