import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';

export function mintInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Case-insensitive invite email binding (trim + lower). */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function inviteExpiresAt(): number {
  return Date.now() + config.teamInviteTtlMs;
}

export function buildInviteAcceptUrl(token: string): string {
  return `${config.publicBaseUrl}/v1/teams/invites/accept?token=${encodeURIComponent(token)}`;
}
