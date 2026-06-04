import { statSync } from 'node:fs';
import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient } from './common';

const EMAIL_RE = /^(?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

export interface GmailPresetConfig {
  recipients: string[];
  account_email?: string;
}

export const gmailDestination: OutputDestination = {
  id: 'gmail',
  label: 'Gmail',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = normaliseConfig(config);
    if (!cfg.recipients.length) throw new NotConfiguredError('Gmail');
    if (cfg.recipients.some(email => !EMAIL_RE.test(email))) return { ok: false, detail: 'Enter a valid recipient email address' };
    const size = statSync(capture.imagePath).size;
    if (size > 25 * 1024 * 1024) return { ok: false, detail: 'Attachment exceeds Gmail’s 25 MB limit' };
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Gmail');
    return backend.deliver('gmail', capture, { ...cfg });
  },
};

function normaliseConfig(config: Record<string, unknown>): GmailPresetConfig {
  const raw = Array.isArray(config.recipients)
    ? config.recipients
    : typeof config.recipients === 'string'
      ? config.recipients.split(',')
      : [];
  return {
    recipients: raw.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean),
    account_email: typeof config.account_email === 'string' ? config.account_email : undefined,
  };
}
