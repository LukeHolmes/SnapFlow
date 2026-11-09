import { BrowserWindow, clipboard, ipcMain, nativeImage, shell, type IpcMainInvokeEvent } from 'electron';
import { unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { CH } from '../shared/channels';
import { listSources, captureSource, captureScrollingSource, captureScrollingPreview, persistDataUrl, persistRedactedImage, type RawCapture } from './capture';
import { getDestination } from './integrations/registry';
import { contextualise } from './pipeline';
import { boxesForDetections, locatePiiInOcr } from './ai/pii-locate';
import { aiProxyFromEnv } from './ai/proxy-client';
import { runOcr } from './ocr';
import { computeDiff } from './diff';
import { diffsDir } from './paths';
import { pinCapture } from './pin';
import { canAddPreset, canUseDestination } from './entitlements';
import { integrationBackendClientFromEnv } from './integrations/backend-client';
import { testZapierWebhook } from './integrations/zapier';
import { connectGoogleDrive, disconnectGoogleDrive, getGoogleDriveStatus } from './integrations/google-drive/service';
import type { Engine } from './engine';
import type { SyncAgent } from './sync/agent';
import type { AnnotationDocument, Capture, ColorFormat, DestinationId, Guide, GuideType, IntegrationStatus } from '../shared/types';

export function registerIpc(engine: Engine, sync: SyncAgent): void {
  const { history, colors, presets, events, ent, workspace: WS } = engine;
  const proxy = aiProxyFromEnv();
  const integrations = integrationBackendClientFromEnv();

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

  ipcMain.handle(CH.captureScrollPreview, async (e, args?: { sourceId?: string; frames?: number; intervalMs?: number }) => {
    return withHiddenSenderWindow(e, () => captureScrollingPreview(args));
  });

  ipcMain.handle(CH.captureScrollSave, async (_e, args: { dataUrl: string; filename: string }) => {
    return saveRawCapture(persistDataUrl(args.dataUrl, args.filename || 'Scrolling capture'));
  });

  ipcMain.handle(CH.captureSaveAnnotated, async (_e, args: { captureId: string; dataUrl: string }) => {
    const original = history.get(WS, args.captureId);
    if (!original) throw new Error('Capture not found');
    return saveRawCapture(persistDataUrl(args.dataUrl, `${original.filename} annotated`));
  });

  ipcMain.handle(CH.capturePiiScan, async (_e, id: string) => {
    const original = history.get(WS, id);
    if (!original?.imagePath) throw new Error('Capture not found');
    const ocr = await runOcr(original.imagePath);
    const detections = locatePiiInOcr(ocr);
    let imageDataUrl: string | null = null;
    try {
      imageDataUrl = 'data:image/png;base64,' + readFileSync(original.imagePath).toString('base64');
    } catch { /* ok */ }
    if (!imageDataUrl) throw new Error('Capture image is unavailable');
    return { imageDataUrl, detections };
  });

  ipcMain.handle(CH.captureSaveRedacted, async (_e, args: string | { id: string; selectedIds?: string[] }) => {
    const id = typeof args === 'string' ? args : args.id;
    const selectedIds = typeof args === 'string' ? undefined : args.selectedIds;
    const original = history.get(WS, id);
    if (!original?.imagePath) throw new Error('Capture not found');
    const ocr = await runOcr(original.imagePath);
    const detections = locatePiiInOcr(ocr);
    const ids = selectedIds?.length ? selectedIds : detections.map(d => d.id);
    const boxes = boxesForDetections(detections, ids);
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
  ipcMain.handle(CH.presetsUpsert, (_e, p: { destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }) => {
    const existing = presets.getByDestination(WS, p.destination);
    if (!existing && !canAddPreset(ent(), presets.count(WS))) {
      return { ok: false, error: `Your plan allows ${ent().maxPresets} preset(s). Upgrade for more.` };
    }
    return { ok: true, preset: presets.upsertByDestination({ workspaceId: WS, ...p }) };
  });
  ipcMain.handle(CH.presetsRemove, (_e, id: string) => { presets.remove(WS, id); return { ok: true }; });
  ipcMain.handle(CH.presetsSend, async (_e, args: { captureId: string; presetId: string }) => {
    const preset = presets.get(WS, args.presetId);
    const capture = history.get(WS, args.captureId);
    if (!preset || !capture) return { ok: false, detail: 'Preset or capture not found' };
    if (!canUseDestination(ent(), preset.destination)) {
      return { ok: false, detail: 'Your current plan only supports clipboard delivery for this destination' };
    }

    try {
      const dest = getDestination(preset.destination);
      if (!dest) return { ok: false, detail: 'Unknown destination' };
      const result = await dest.deliver(capture, preset.config);
      if (result.queued) {
        events.append(WS, 'delivery_queued', `${preset.name} queued — ${result.detail}`);
      } else if (result.ok) {
        events.append(WS, 'delivered', `Delivered to ${preset.name}${result.url ? ` · ${result.url}` : ''}`);
      } else {
        events.append(WS, 'delivery_failed', `${preset.name} failed — ${result.detail}`);
      }
      return result;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Delivery failed';
      events.append(WS, 'delivery_failed', `${preset.name} failed — ${detail}`);
      return { ok: false, detail };
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
  ipcMain.handle(CH.integrationsStatuses, async () => {
    const remote: IntegrationStatus[] = integrations.configured
      ? await integrations.getStatuses()
      : [
          { destination: 'slack', connected: false, state: 'disconnected', message: 'SnapFlow backend is not configured' },
          { destination: 'jira', connected: false, state: 'disconnected', message: 'SnapFlow backend is not configured' },
          { destination: 'notion', connected: false, state: 'disconnected', message: 'SnapFlow backend is not configured' },
          { destination: 'gmail', connected: false, state: 'disconnected', message: 'SnapFlow backend is not configured' },
          { destination: 'github', connected: false, state: 'disconnected', message: 'SnapFlow backend is not configured' },
        ];
    const zapier = presets.getByDestination(WS, 'zapier');
    const webhookUrl = typeof zapier?.config.webhook_url === 'string' ? zapier.config.webhook_url : '';
    remote.push({
      destination: 'zapier',
      connected: isHttpsUrl(webhookUrl),
      state: !zapier
        ? 'disconnected'
        : isHttpsUrl(webhookUrl)
          ? 'connected'
          : 'error',
      label: zapier?.target || webhookUrl || undefined,
      secondary: zapier ? (isHttpsUrl(webhookUrl) ? 'Webhook configured' : 'Enter a valid HTTPS webhook URL') : undefined,
    });
    remote.push(getGoogleDriveStatus());
    return remote;
  });
  ipcMain.handle(CH.integrationsConnect, async (_e, args: { destination: DestinationId; params?: Record<string, string> }) => {
    if (args.destination === 'clipboard' || args.destination === 'zapier') return { ok: false, detail: 'This destination does not use OAuth' };
    if (args.destination === 'google-drive') return connectGoogleDrive();
    try {
      const url = await integrations.getOAuthUrl(args.destination, args.params ?? {});
      await shell.openExternal(url);
      return { ok: true, detail: `Opening ${args.destination} connection` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Unable to start OAuth' };
    }
  });
  ipcMain.handle(CH.integrationsDisconnect, async (_e, destination: DestinationId) => {
    if (destination === 'clipboard' || destination === 'zapier') return { ok: false, detail: 'This destination does not use OAuth' };
    if (destination === 'google-drive') return disconnectGoogleDrive();
    if (!integrations.configured) return { ok: false, detail: 'SnapFlow backend is not configured' };
    try {
      await integrations.disconnect(destination);
      return { ok: true, detail: `Disconnected ${destination}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Disconnect failed' };
    }
  });
  ipcMain.handle(CH.integrationsSlackChannels, () => integrations.getSlackChannels());
  ipcMain.handle(CH.integrationsNotionPages, (_e, query: string) => integrations.searchNotionPages(query));
  ipcMain.handle(CH.integrationsGmailProfile, () => integrations.getGmailProfile());
  ipcMain.handle(CH.integrationsGithubRepos, (_e, query: string) => integrations.listGithubRepos(query));
  ipcMain.handle(CH.integrationsZapierTest, async (_e, config: Record<string, unknown>) => {
    const capture = history.list(WS, { limit: 1 })[0];
    if (!capture) return { ok: false, detail: 'Take a capture first' };
    return testZapierWebhook(config as any, capture);
  });

  ipcMain.handle(CH.syncNow, () => sync.run());

  // ── Diff mode (v1.1) ────────────────────────────────────────────────────────
  ipcMain.handle(CH.diffCompute, async (_e, args: { beforeId: string; afterId: string }) => {
    const before = history.get(WS, args.beforeId);
    const after  = history.get(WS, args.afterId);
    if (!before?.imagePath || !after?.imagePath) return { ok: false, error: 'Capture not found or has no image' };
    try {
      const { join } = require('node:path') as typeof import('node:path');
      const outputPath = join(diffsDir(), `diff-${Date.now()}.png`);
      const result = await computeDiff(before.imagePath, after.imagePath, outputPath);
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

  ipcMain.handle(CH.colourFormatGet, () => colors.getFormat());
  ipcMain.handle(CH.colourFormatSet, (_e, format: ColorFormat) => {
    if (format !== 'hex' && format !== 'rgb' && format !== 'hsl') return colors.getFormat();
    colors.setFormat(format);
    return colors.getFormat();
  });
  ipcMain.handle(CH.colourRecentList, (_e, limit = 24) => colors.list(WS, limit));
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}


async function withHiddenSenderWindow<T>(event: IpcMainInvokeEvent, fn: () => Promise<T>): Promise<T> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const shouldRestore = !!win && !win.isDestroyed() && win.isVisible();
  if (shouldRestore) {
    win!.hide();
    await new Promise(resolve => setTimeout(resolve, 140));
  }
  try {
    return await fn();
  } finally {
    if (shouldRestore && win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  }
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
