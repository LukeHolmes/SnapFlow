/** Backend `error` codes for `POST /v1/teams/invites/accept` → desktop copy. */
export const TEAM_INVITE_ERROR_MESSAGES: Record<string, string> = {
  invite_email_mismatch:
    'This invite was sent to a different email address. Sign in with that email, then open the link again.',
  invite_used: 'This invite link has already been used.',
  invite_expired: 'This invite link has expired. Ask your team admin for a new one.',
  seat_limit: 'This team has no open seats. Ask an admin to free a seat or upgrade.',
  not_found: 'Invite not found. Check the link or request a new invite.',
};

export function teamInviteErrorMessage(code: string, fallback?: string): string {
  return TEAM_INVITE_ERROR_MESSAGES[code] ?? fallback ?? 'Could not accept team invite';
}
