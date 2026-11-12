import type { AccountSummary } from '../../shared/types';

export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

export function initialsFromLabel(name: string): string {
  const bits = name.trim().split(/\s+/).filter(Boolean);
  if (bits.length >= 2) return (bits[0][0] + bits[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function greetingName(profile: AccountSummary | null): string {
  if (profile?.signedIn && profile.displayName) return profile.displayName.split(/\s+/)[0] ?? profile.displayName;
  return 'there';
}
