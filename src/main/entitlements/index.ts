// Tier & entitlement model (architecture §8, §11).
//
// IMPORTANT: limits enforced here are the CLIENT-SIDE half only — local-only
// limits such as preset count and history window. Anything that costs money
// (AI calls, cloud storage, shared libraries) must additionally be gated
// SERVER-SIDE by the backend, which is the single source of truth. The desktop
// app must never be the sole enforcement point for paid capabilities.

import type { DestinationId, Entitlements, Tier } from '../../shared/types';

const TABLE: Record<Tier, Omit<Entitlements, 'tier'>> = {
  free: {
    historyWindowDays: 30, maxPresets: 1, aiEnabled: false, cloudSync: false, sharedLibrary: false, diffAdvanced: false,
    focusBlurMaxRegions: 1, focusBlurPresetAutomation: false,
    maxRecordingDurationSec: 5 * 60,
    recordingSystemAudio: false, recordingMicrophone: false, recordingGifExport: false,
  },
  pro: {
    historyWindowDays: null, maxPresets: 5, aiEnabled: true, cloudSync: true, sharedLibrary: false, diffAdvanced: true,
    focusBlurMaxRegions: null, focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 60 * 60,
    recordingSystemAudio: true, recordingMicrophone: true, recordingGifExport: true,
  },
  team: {
    historyWindowDays: null, maxPresets: null, aiEnabled: true, cloudSync: true, sharedLibrary: true, diffAdvanced: true,
    focusBlurMaxRegions: null, focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 2 * 60 * 60,
    recordingSystemAudio: true, recordingMicrophone: true, recordingGifExport: true,
  },
  perpetual: {
    historyWindowDays: null, maxPresets: 5, aiEnabled: true, cloudSync: false, sharedLibrary: false, diffAdvanced: true,
    focusBlurMaxRegions: null, focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 60 * 60,
    recordingSystemAudio: true, recordingMicrophone: true, recordingGifExport: true,
  },
};

export function entitlementsFor(tier: Tier): Entitlements {
  return { tier, ...TABLE[tier] };
}

/** Dev convenience: tier comes from env, defaults to pro. Real builds read it from the backend. */
export function currentTier(): Tier {
  const t = (process.env.SNAPFLOW_TIER as Tier) || 'pro';
  return (['free', 'pro', 'team', 'perpetual'] as Tier[]).includes(t) ? t : 'pro';
}

export function canAddPreset(ent: Entitlements, currentCount: number): boolean {
  return ent.maxPresets == null || currentCount < ent.maxPresets;
}

export function canUseDestination(ent: Entitlements, destination: DestinationId): boolean {
  if (destination === 'clipboard' || destination === 'google-drive') return true;
  return ent.tier !== 'free';
}

export function canRecordWithAudio(ent: Entitlements, opts: { mic?: boolean; system?: boolean }): boolean {
  if (opts.mic && !ent.recordingMicrophone) return false;
  if (opts.system && !ent.recordingSystemAudio) return false;
  return true;
}

export function canExportRecordingGif(ent: Entitlements): boolean {
  return ent.recordingGifExport;
}

export function canAddFocusBlurRegion(ent: Entitlements, currentCount: number): boolean {
  return ent.focusBlurMaxRegions == null || currentCount < ent.focusBlurMaxRegions;
}

export function canUseFocusBlurPresetAutomation(ent: Entitlements): boolean {
  return !!ent.focusBlurPresetAutomation;
}
