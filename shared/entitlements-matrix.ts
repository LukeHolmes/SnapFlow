/**
 * Canonical per-tier entitlement matrix for SnapFlow.
 * Desktop (`src/main/entitlements`) and backend (`backend/src/entitlements`) must
 * both derive from this table — see `tests/entitlements-matrix.test.ts`.
 */

export type Tier = 'free' | 'pro' | 'team' | 'perpetual';

export interface EntitlementRow {
  historyWindowDays: number | null;
  maxPresets: number | null;
  aiEnabled: boolean;
  cloudSync: boolean;
  sharedLibrary: boolean;
  diffAdvanced: boolean;
  focusBlurMaxRegions: number | null;
  focusBlurPresetAutomation: boolean;
  maxRecordingDurationSec: number;
  recordingSystemAudio: boolean;
  recordingMicrophone: boolean;
  recordingGifExport: boolean;
}

export const ENTITLEMENTS_MATRIX: Record<Tier, EntitlementRow> = {
  free: {
    historyWindowDays: 30,
    maxPresets: 1,
    aiEnabled: false,
    cloudSync: false,
    sharedLibrary: false,
    diffAdvanced: false,
    focusBlurMaxRegions: 1,
    focusBlurPresetAutomation: false,
    maxRecordingDurationSec: 5 * 60,
    recordingSystemAudio: false,
    recordingMicrophone: false,
    recordingGifExport: false,
  },
  pro: {
    historyWindowDays: null,
    maxPresets: 5,
    aiEnabled: true,
    cloudSync: true,
    sharedLibrary: false,
    diffAdvanced: true,
    focusBlurMaxRegions: null,
    focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 60 * 60,
    recordingSystemAudio: true,
    recordingMicrophone: true,
    recordingGifExport: true,
  },
  team: {
    historyWindowDays: null,
    maxPresets: null,
    aiEnabled: true,
    cloudSync: true,
    sharedLibrary: true,
    diffAdvanced: true,
    focusBlurMaxRegions: null,
    focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 2 * 60 * 60,
    recordingSystemAudio: true,
    recordingMicrophone: true,
    recordingGifExport: true,
  },
  perpetual: {
    historyWindowDays: null,
    maxPresets: 5,
    aiEnabled: true,
    cloudSync: false,
    sharedLibrary: false,
    diffAdvanced: true,
    focusBlurMaxRegions: null,
    focusBlurPresetAutomation: true,
    maxRecordingDurationSec: 60 * 60,
    recordingSystemAudio: true,
    recordingMicrophone: true,
    recordingGifExport: true,
  },
};

/** Documented tier gates (docs/FOCUS_BLUR.md, docs/SCREEN_RECORDING.md, docs/TEAM_TIER.md). */
export const DOCS_ENTITLEMENTS_MATRIX: Record<Tier, EntitlementRow> = ENTITLEMENTS_MATRIX;
