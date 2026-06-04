import { clipboard, ipcMain, nativeImage } from 'electron';
import { unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { CH } from '../shared/channels';
import { listSources, captureSource, captureScrollingSource, captureScrollingPreview, persistDataUrl, persistRedactedImage, type RawCapture, type RedactionBox } from './capture';
import { getDestination } from './integrations/registry';
import { contextualise } from './pipeline';
import { detectPii } from './ai/pii';
import { aiProxyFromEnv } from './ai/proxy-client';
import { runOcr, type OcrResult } from './ocr';
import { computeDiff } from './diff';
import { diffsDir } from './paths';
import { pinCapture } from './pin';
import { deliverClientFromEnv } from './deliver/client';
import { canAddPreset } from './entitlements';
import type { Engine } from './engine';
import type { SyncAgent } from './sync/agent';
import type { AnnotationDocument, Capture, DestinationId, Guide, GuideType } from '../shared/types';

export function registerIpc(engine: Engine, sync: SyncAgent): void {
  const { history, presets, events, ent, workspace: WS } = engine;
  const proxy = aiProxyFromEnv();
  const deliver = deliverClientFromEnv();

  ipcMain.handle(CH.captureListSources, () => listSources());

  const saveRawCapture = async (raw: RawCapture): Promise<Capture> => {
    const capture: Capture = { id: raw.id, workspaceId: WS, filename: raw.filename, imagePath: raw.imagePath, tag: null, ocrText: '', hasPii: false, createdAt: Date.now() };
    history.insert(capture);
    return contextualise(capture, ent(), history, events);
  };

  // Full-screen capture (used by the Window quick action until a window picker lands).
  ipcMain.handle(CH.captureScreen, async (_e, sourceId?: string) => {
    return saveRawCapture(await captureSource(sourceId));
  });

  ipcMain.handle(CH.captureScroll, async (_e, args?: { sourceId?: string; frames?: number; intervalMs?: number }) => {
    return saveRawCapture(await captureScrollingSource(args));
  });

  ipcMain.handle(CH.captureScrollPreview, async (_e, args?: { sourceId?: string; frames?: number; intervalMs?: number }) => {
    return captureScrollingPreview(args);
  });

  ipcMain.handle(CH.captureScrollSave, async (_e, args: { dataUrl: string; filename: string }) => {
    return saveRawCapture(persistDataUrl(args.dataUrl, args.filename || 'Scrolling capture'));
  });

  ipcMain.handle(CH.captureSaveAnnotated, async (_e, args: { captureId: string; dataUrl: string }) => {
    const original = history.get(WS, args.captureId);
    if (!original) throw new Error('Capture not found');
    return saveRawCapture(persistDataUrl(args.dataUrl, `${original.filename} annotated`));
  });

  ipcMain.handle(CH.captureSaveRedacted, async (_e, id: string) => {
    const original = history.get(WS, id);
    if (!original?.imagePath) throw new Error('Capture not found');
    const ocr = await runOcr(original.imagePath);
    const boxes = piiBoxes(ocr);
    return saveRawCapture(persistRedactedImage(original.imagePath, boxes, `${original.filename} redacted`));
  });

  ipcMain.handle(CH.captureAnnotationsGet, (_e, id: string) => history.getAnnotationDocument(WS, id));
  ipcMain.handle(CH.captureAnnotationsSave, (_e, args: { captureId: string; doc: AnnotationDocument }) => {
    const capture = history.get(WS, args.captureId);
    if (!capture) return { ok: false, detail: 'Capture not found' };
    history.saveAnnotationDocument(WS, args.captureId, args.doc);
    return { ok: true, detail: 'Annotation draft saved' };
  });

  ipcMain.handle(CH.captureCopyImage, (_e, id: string) => {
    const capture = history.get(WS, id);
    if (!capture?.imagePath) return { ok: false, detail: 'Capture not found' };
    const image = nativeImage.createFromPath(capture.imagePath);
    if (image.isEmpty()) return { ok: false, detail: 'Capture image is unavailable' };
    clipboard.writeImage(image);
    return { ok: true, detail: 'Copied image to clipboard' };
  });

  ipcMain.handle(CH.captureCopyOcr, (_e, id: string) => {
    const capture = history.get(WS, id);
    if (!capture) return { ok: false, detail: 'Capture not found' };
    if (!capture.ocrText.trim()) return { ok: false, detail: 'No OCR text available yet' };
    clipboard.writeText(capture.ocrText);
    return { ok: true, detail: 'Copied OCR text to clipboard' };
  });

  ipcMain.handle(CH.capturePin, (_e, id: string) => {
    const capture = history.get(WS, id);
    if (!capture) return { ok: false, detail: 'Capture not found' };
    return pinCapture(capture);
  });

  ipcMain.handle(CH.historyList, (_e, limit = 50) => history.list(WS, { limit, sinceDays: ent().historyWindowDays }));
  ipcMain.handle(CH.historySearch, (_e, query: string) => history.search(WS, query));
  ipcMain.handle(CH.historyDelete, async (_e, id: string) => {
    const imagePath = history.delete(WS, id);
    if (imagePath) unlink(imagePath).catch(() => {}); // best-effort; file may already be gone
    return { ok: true };
  });

  ipcMain.handle(CH.presetsList, () => presets.list(WS));
  ipcMain.handle(CH.presetsAdd, (_e, p: { destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }) => {
    if (!canAddPreset(ent(), presets.count(WS))) return { ok: false, error: `Your plan allows ${ent().maxPresets} preset(s). Upgrade for more.` };
    return { ok: true, preset: presets.add({ workspaceId: WS, ...p }) };
  });
  ipcMain.handle(CH.presetsRemove, (_e, id: string) => { presets.remove(WS, id); return { ok: true }; });
  ipcMain.handle(CH.presetsSend, async (_e, args: { captureId: string; presetId: string }) => {
    const preset = presets.get(WS, args.presetId);
    const capture = history.get(WS, args.captureId);
    if (!preset || !capture) return { ok: false, detail: 'Preset or capture not found' };

    // Clipboard is local. Auth'd destinations go through the backend, which holds the
    // OAuth token in its vault — the token never lives on the client. Falls back to the
    // local plugin when no backend is configured (the plugin throws NotConfiguredError).
    try {
      let result;
      if (preset.destination !== 'clipboard' && deliver.configured) {
        result = await deliver.deliver(preset.destination, capture, preset.target);
      } else {
        const dest = getDestination(preset.destination);
        if (!dest) return { ok: false, detail: 'Unknown destination' };
        result = await dest.deliver(capture, preset.config);
      }
      if (result.ok) events.append(WS, 'sent', `Sent to ${preset.target} on ${preset.name}`);
      return result;
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Delivery failed' };
    }
  });

  ipcMain.handle(CH.guidesList, () => history.listGuides(WS));
  ipcMain.handle(CH.guidesCreate, (_e, args: { title: string; type: GuideType; captureIds: string[] }) => {
    return history.createGuide(WS, args);
  });
  ipcMain.handle(CH.guidesGet, (_e, id: string) => history.getGuide(WS, id) ?? null);
  ipcMain.handle(CH.guidesUpdate, (_e, guide: Guide) => {
    const updated = history.updateGuide(WS, guide);
    return updated ? { ok: true, detail: 'Guide saved', guide: updated } : { ok: false, detail: 'Guide not found' };
  });
  ipcMain.handle(CH.guidesExportMarkdown, (_e, id: string) => {
    const guide = history.getGuide(WS, id);
    if (!guide) return { ok: false, detail: 'Guide not found' };
    const markdown = renderGuideMarkdown(guide);
    clipboard.writeText(markdown);
    return { ok: true, detail: 'Guide Markdown copied to clipboard', markdown };
  });

  ipcMain.handle(CH.entitlementsGet, () => ent());
  ipcMain.handle(CH.statsGet, () => history.stats(WS));
  ipcMain.handle(CH.eventsRecent, (_e, limit = 8) => events.recent(WS, limit));

  ipcMain.handle(CH.syncNow, () => sync.run());

  // ── Diff mode (v1.1) ────────────────────────────────────────────────────────
  ipcMain.handle(CH.diffCompute, (_e, args: { beforeId: string; afterId: string }) => {
    const before = history.get(WS, args.beforeId);
    const after  = history.get(WS, args.afterId);
    if (!before?.imagePath || !after?.imagePath) return { ok: false, error: 'Capture not found or has no image' };
    try {
      const { join } = require('node:path') as typeof import('node:path');
      const outputPath = join(diffsDir(), `diff-${Date.now()}.png`);
      const result = computeDiff(before.imagePath, after.imagePath, outputPath);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Diff computation failed' };
    }
  });

  ipcMain.handle(CH.diffSummarise, async (_e, args: { beforeId: string; afterId: string }) => {
    if (!ent().aiEnabled) return { ok: false, error: 'Diff AI summary requires Pro or Team' };
    const before = history.get(WS, args.beforeId);
    const after  = history.get(WS, args.afterId);
    if (!before?.imagePath || !after?.imagePath) return { ok: false, error: 'Capture not found' };
    try {
      const summary = await proxy.diffSummary(readFileSync(before.imagePath), readFileSync(after.imagePath), ent());
      return { ok: true, summary: summary ?? 'Unable to summarise changes.' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'AI summary failed' };
    }
  });

  ipcMain.handle(CH.captureGetImage, (_e, id: string) => {
    const capture = history.get(WS, id);
    if (!capture?.imagePath) return null;
    try { return 'data:image/png;base64,' + readFileSync(capture.imagePath).toString('base64'); }
    catch { return null; }
  });
}

function piiBoxes(ocr: OcrResult): RedactionBox[] {
  const hits = detectPii(ocr.text).map(hit => normalise(hit.value)).filter(Boolean);
  if (!hits.length) return [];

  const words = ocr.words
    .filter(word => word.text?.trim() && word.bbox)
    .map(word => ({ ...word, norm: normalise(word.text) }))
    .filter(word => word.norm);

  const boxes: RedactionBox[] = [];
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    let box: RedactionBox | null = null;
    for (let end = start; end < Math.min(words.length, start + 8); end += 1) {
      const word = words[end];
      joined += word.norm;
      box = mergeBox(box, word.bbox);
      if (hits.some(hit => joined.includes(hit) || hit.includes(joined))) {
        if (box) boxes.push(box);
        break;
      }
      if (joined.length > 64) break;
    }
  }

  return dedupeBoxes(boxes);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

function mergeBox(a: RedactionBox | null, b: RedactionBox): RedactionBox {
  return a
    ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
    : { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
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

function renderGuideMarkdown(guide: Guide): string {
  const typeLabel = guide.type.replace(/_/g, ' ');
  const lines = [
    `# ${guide.title}`,
    '',
    `> ${typeLabel}`,
    '',
    '## Summary',
    '',
    guide.summary || 'Add a short summary of this guide.',
    '',
    '## Steps',
    '',
  ];

  for (const step of guide.steps) {
    const imagePath = step.capture?.imagePath ?? '';
    lines.push(`### Step ${step.order}: ${step.title.replace(/^Step \d+:\s*/i, '')}`);
    lines.push('');
    if (imagePath) {
      lines.push(`![${escapeMarkdown(step.title)}](${imagePath})`);
      lines.push('');
    }
    lines.push(step.description || 'Add instructions for this step.');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Generated with SnapFlow.');
  return lines.join('\n');
}

function escapeMarkdown(value: string): string {
  return value.replace(/[[\]()`]/g, '\\$&');
}
