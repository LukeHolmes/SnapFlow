import { ipcMain } from 'electron';
import { unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { CH } from '../shared/channels';
import { listSources, captureSource } from './capture';
import { getDestination } from './integrations/registry';
import { contextualise } from './pipeline';
import { aiProxyFromEnv } from './ai/proxy-client';
import { computeDiff } from './diff';
import { diffsDir } from './paths';
import { deliverClientFromEnv } from './deliver/client';
import { canAddPreset } from './entitlements';
import type { Engine } from './engine';
import type { SyncAgent } from './sync/agent';
import type { Capture, DestinationId } from '../shared/types';

export function registerIpc(engine: Engine, sync: SyncAgent): void {
  const { history, presets, events, ent, workspace: WS } = engine;
  const proxy = aiProxyFromEnv();
  const deliver = deliverClientFromEnv();

  ipcMain.handle(CH.captureListSources, () => listSources());

  // Full-screen capture (used by the Window quick action until a window picker lands).
  ipcMain.handle(CH.captureScreen, async (_e, sourceId?: string) => {
    const raw = await captureSource(sourceId);
    const capture: Capture = { id: raw.id, workspaceId: WS, filename: raw.filename, imagePath: raw.imagePath, tag: null, ocrText: '', hasPii: false, createdAt: Date.now() };
    history.insert(capture);
    return contextualise(capture, ent(), history, events);
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
