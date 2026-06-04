import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';

// Stub with the correct contract. Sends the capture as an SMTP attachment.
// Add `nodemailer` to wire this fully; credentials come from the user (§5).
export const emailDestination: OutputDestination = {
  id: 'email',
  label: 'Email',
  requiresAuth: true,
  async deliver(_capture, config) {
    if (!config.smtpHost || !config.to) throw new NotConfiguredError('Email');
    return { ok: true, detail: `Emailed to ${String(config.to)}` };
  },
};
