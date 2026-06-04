import type { Capture, DeliverResult } from '../../shared/types';
import { integrationBackendClientFromEnv } from './backend-client';
import { getIntegrationRuntime } from './runtime';

const backend = integrationBackendClientFromEnv();

export function backendClient() {
  return backend;
}

export function formatCaptureTimestamp(createdAt: number): string {
  return new Date(createdAt).toISOString();
}

export function ocrWordCount(capture: Capture): number {
  return (capture.ocrText.trim().match(/\S+/g) ?? []).length;
}

export function metadataComment(capture: Capture): string {
  const tag = capture.tag ?? 'untagged';
  return [
    `Tag: ${tag}`,
    `Timestamp: ${formatCaptureTimestamp(capture.createdAt)}`,
    `PII redaction: ${capture.hasPii ? 'redacted' : 'clear'}`,
  ].join(' • ');
}

export function queuedResult(detail = 'Capture still syncing, delivery queued'): DeliverResult {
  return { ok: true, queued: true, detail };
}

export async function ensureCaptureUrl(capture: Capture, timeoutMs = 30_000): Promise<string | null> {
  if (!backend.configured) return null;
  const existing = await backend.getCaptureUrl(capture.id);
  if (existing) return existing;

  const sync = getIntegrationRuntime().sync;
  if (!sync) return null;

  void sync.run();
  const uploaded = await sync.waitForBlobUpload(capture.id, timeoutMs);
  if (!uploaded) return null;
  return backend.getCaptureUrl(capture.id);
}
