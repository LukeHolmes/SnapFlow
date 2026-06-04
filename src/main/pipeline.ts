// The "Contextualise" stage of Capture -> Context -> Deliver.
// Runs after a raw capture is on disk: OCR -> local PII scan -> tag -> index -> events.
import { readFileSync } from 'node:fs';
import type { HistoryStore } from './history/store';
import type { EventLog } from './events/log';
import type { Entitlements, Capture, ContentTag } from '../shared/types';
import { runOcr } from './ocr';
import { detectPii } from './ai/pii';
import { aiProxyFromEnv, heuristicTag } from './ai/proxy-client';

const proxy = aiProxyFromEnv();

export async function contextualise(
  capture: Capture,
  ent: Entitlements,
  history: HistoryStore,
  events: EventLog,
  // Injectable for testing; defaults to the real on-device OCR engine.
  ocrFn: (path: string) => Promise<{ text: string }> = runOcr,
): Promise<Capture> {
  events.append(capture.workspaceId, 'capture', `${capture.filename} captured`);

  let ocrText = '';
  try {
    ocrText = (await ocrFn(capture.imagePath)).text;
  } catch {
    // OCR is best-effort; capture is still saved and searchable by filename.
  }

  const pii = detectPii(ocrText);
  const hasPii = pii.length > 0;

  // Prefer the metered AI proxy when entitled + configured; fall back to the local heuristic.
  let tag: ContentTag = heuristicTag(ocrText);
  if (ent.aiEnabled) {
    try {
      const aiTag = await proxy.autoTag(readFileSync(capture.imagePath), ent);
      if (aiTag) tag = aiTag;
    } catch { /* keep heuristic */ }
  }

  history.updateAnalysis(capture.id, ocrText, tag, hasPii);

  // Always emit the tag event — even captures with no readable text are still tagged.
  events.append(capture.workspaceId, 'tag', `Auto-tagged as '${tag}'`);
  if (hasPii) events.append(capture.workspaceId, 'pii', `PII detected and redacted (${pii[0].type})`);

  return { ...capture, ocrText, tag, hasPii };
}
