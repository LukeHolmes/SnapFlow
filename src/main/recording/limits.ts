import type { Entitlements, RecordingStartOptions } from '../../shared/types';
import { canRecordWithAudio } from '../entitlements';

export function validateRecordingStart(ent: Entitlements, opts: RecordingStartOptions): string | null {
  if (ent.maxRecordingDurationSec <= 0) return 'Screen recording is not available on your plan';
  const wantsMic = !!opts.includeMic;
  const wantsSystem = !!opts.includeSystemAudio;
  if ((wantsMic || wantsSystem) && !canRecordWithAudio(ent, { mic: wantsMic, system: wantsSystem })) {
    return 'Microphone or system audio recording requires SnapFlow Pro';
  }
  if (opts.mode === 'window' && !opts.sourceId) return 'Pick a window to record';
  if (opts.mode === 'region' && !opts.crop) return 'Select a region to record';
  return null;
}

export function maxDurationMs(ent: Entitlements): number {
  return ent.maxRecordingDurationSec * 1000;
}
