import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Capture, DeliverResult } from '../../shared/types';
import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient, formatCaptureTimestamp } from './common';

export interface ZapierPresetConfig {
  webhook_url: string;
  secret?: string;
  preset_name?: string;
}

const TIMEOUT_MS = 10_000;

export const zapierDestination: OutputDestination = {
  id: 'zapier',
  label: 'Zapier Webhook',
  requiresAuth: false,
  async deliver(capture, config) {
    const cfg = config as unknown as ZapierPresetConfig;
    if (!cfg.webhook_url) throw new NotConfiguredError('Zapier Webhook');
    if (!isHttpsUrl(cfg.webhook_url)) return { ok: false, detail: 'Webhook URL must be a valid HTTPS URL' };
    const payload = await buildZapierPayload(capture, cfg);
    return postWebhook(cfg, payload);
  },
};

export async function buildZapierPayload(capture: Capture, config: ZapierPresetConfig, test = false): Promise<Record<string, unknown>> {
  const backend = backendClient();
  const imageUrl = backend.configured ? await backend.getCaptureUrl(capture.id).catch(() => null) : null;
  return {
    capture_id: capture.id,
    timestamp: formatCaptureTimestamp(capture.createdAt),
    content_tag: capture.tag,
    image_url: imageUrl,
    image_filename: capture.filename,
    ocr_text: capture.ocrText || null,
    pii_redacted: capture.hasPii,
    workspace_id: capture.workspaceId,
    preset_name: config.preset_name ?? 'Zapier Webhook',
    note: imageUrl ? undefined : 'Capture is local-only or cloud sync is not available yet.',
    ...(test ? { test: true } : {}),
  };
}

export function signWebhookPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(body: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signWebhookPayload(body, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function testZapierWebhook(config: ZapierPresetConfig, sampleCapture: Capture): Promise<DeliverResult> {
  if (!isHttpsUrl(config.webhook_url)) return { ok: false, detail: 'Webhook URL must be a valid HTTPS URL' };
  const payload = await buildZapierPayload(sampleCapture, config, true);
  return postWebhook(config, payload);
}

async function postWebhook(config: ZapierPresetConfig, payload: Record<string, unknown>): Promise<DeliverResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.secret ? { 'X-SnapFlow-Signature': signWebhookPayload(body, config.secret) } : {}),
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `${res.status} ${text.slice(0, 200)}`.trim() };
    }
    return { ok: true, detail: `Delivered to ${new URL(config.webhook_url).host}` };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { ok: false, detail: 'Webhook request timed out after 10s' };
    return { ok: false, detail: error instanceof Error ? error.message : 'Webhook delivery failed' };
  } finally {
    clearTimeout(timer);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
