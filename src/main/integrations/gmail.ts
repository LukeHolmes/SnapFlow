import { statSync } from 'node:fs';
import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient } from './common';

const EMAIL_RE = /^(?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

export interface GmailPresetConfig {
  recipients: string[];
  account_email?: string;
  cc: string[];
  bcc: string[];
  subject?: string;
  body?: string;
}

export const gmailDestination: OutputDestination = {
  id: 'gmail',
  label: 'Gmail',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = normaliseConfig(config);
    const allRecipients = [...cfg.recipients, ...cfg.cc, ...cfg.bcc];
    if (!cfg.recipients.length && !cfg.cc.length && !cfg.bcc.length) throw new NotConfiguredError('Gmail');
    const invalid = allRecipients.find(email => !EMAIL_RE.test(email));
    if (invalid) return { ok: false, detail: `Enter a valid email address (${invalid})` };
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Gmail');
    const size = statSync(capture.imagePath).size;
    if (size > 25 * 1024 * 1024) return { ok: false, detail: 'Attachment exceeds Gmail’s 25 MB limit' };
    return backend.deliver('gmail', capture, { ...cfg });
  },
};

function normaliseConfig(config: Record<string, unknown>): GmailPresetConfig {
  return {
    recipients: normaliseEmails(config.recipients),
    cc: normaliseEmails((config as any).cc),
    bcc: normaliseEmails((config as any).bcc),
    account_email: typeof config.account_email === 'string' ? config.account_email : undefined,
    subject: typeof (config as any).subject === 'string' ? (config as any).subject : undefined,
    body: typeof (config as any).body === 'string' ? (config as any).body : undefined,
  };
}

function normaliseEmails(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}
