// Pure recording session state machine — no Electron deps (headless tests).
import type { RecordingPhase } from '../../shared/types';

export type RecordingEvent =
  | { type: 'ARM'; countdownSec: number }
  | { type: 'COUNTDOWN_DONE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'TICK'; elapsedMs: number }
  | { type: 'MAX_DURATION' }
  | { type: 'SAVE_DONE' }
  | { type: 'FAIL'; message: string };

export interface RecordingMachineState {
  phase: RecordingPhase;
  elapsedMs: number;
  paused: boolean;
  message?: string;
}

const IDLE: RecordingMachineState = { phase: 'idle', elapsedMs: 0, paused: false };

export function recordingInitialState(): RecordingMachineState {
  return { ...IDLE };
}

export function recordingTransition(
  state: RecordingMachineState,
  event: RecordingEvent,
): RecordingMachineState {
  switch (event.type) {
    case 'ARM':
      if (state.phase !== 'idle' && state.phase !== 'error') return state;
      return { phase: 'countdown', elapsedMs: 0, paused: false };
  case 'COUNTDOWN_DONE':
      if (state.phase !== 'countdown') return state;
      return { phase: 'recording', elapsedMs: 0, paused: false };
    case 'PAUSE':
      if (state.phase !== 'recording') return state;
      return { ...state, phase: 'paused', paused: true };
    case 'RESUME':
      if (state.phase !== 'paused') return state;
      return { ...state, phase: 'recording', paused: false };
    case 'STOP':
      if (state.phase === 'idle' || state.phase === 'stopping' || state.phase === 'saving') return state;
      return { ...state, phase: 'stopping', paused: false };
    case 'TICK':
      if (state.phase !== 'recording') return state;
      return { ...state, elapsedMs: event.elapsedMs };
    case 'MAX_DURATION':
      if (state.phase !== 'recording' && state.phase !== 'paused') return state;
      return { ...state, phase: 'stopping', message: 'Max duration reached' };
    case 'SAVE_DONE':
      return { ...IDLE };
    case 'FAIL':
      return { phase: 'error', elapsedMs: state.elapsedMs, paused: false, message: event.message };
    default:
      return state;
  }
}

/** Whether MediaRecorder should be actively encoding. */
export function shouldMediaRecorderRun(state: RecordingMachineState): boolean {
  return state.phase === 'recording' && !state.paused;
}
