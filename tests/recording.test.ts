import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import {
  recordingInitialState,
  recordingTransition,
  shouldMediaRecorderRun,
} from '../src/main/recording/state-machine';
import { validateRecordingStart, maxDurationMs, withWindowSource } from '../src/main/recording/limits';
import { entitlementsFor, canExportRecordingGif, canRecordWithAudio } from '../src/main/entitlements';
import type { Capture } from '../src/shared/types';

test('recording state machine: arm → record → pause → resume → stop → save', () => {
  let s = recordingInitialState();
  s = recordingTransition(s, { type: 'ARM', countdownSec: 2 });
  assert.equal(s.phase, 'countdown');
  s = recordingTransition(s, { type: 'COUNTDOWN_DONE' });
  assert.equal(s.phase, 'recording');
  assert.equal(shouldMediaRecorderRun(s), true);
  s = recordingTransition(s, { type: 'PAUSE' });
  assert.equal(shouldMediaRecorderRun(s), false);
  s = recordingTransition(s, { type: 'RESUME' });
  s = recordingTransition(s, { type: 'TICK', elapsedMs: 1500 });
  assert.equal(s.elapsedMs, 1500);
  s = recordingTransition(s, { type: 'STOP' });
  assert.equal(s.phase, 'stopping');
  s = recordingTransition(s, { type: 'SAVE_DONE' });
  assert.equal(s.phase, 'idle');
});

test('withWindowSource: validation passes after user picks a window', () => {
  const opts = withWindowSource({ mode: 'window', countdownSec: 2 }, 'window:42');
  assert.equal(opts.sourceId, 'window:42');
  assert.equal(validateRecordingStart(entitlementsFor('pro'), opts), null);
  assert.equal(validateRecordingStart(entitlementsFor('pro'), { mode: 'window' }), 'Pick a window to record');
});

test('tier limits: free audio and gif gated', () => {
  const free = entitlementsFor('free');
  const pro = entitlementsFor('pro');
  assert.equal(canRecordWithAudio(free, { mic: true }), false);
  assert.equal(canRecordWithAudio(pro, { system: true }), true);
  assert.equal(canExportRecordingGif(free), false);
  assert.equal(canExportRecordingGif(pro), true);
  assert.equal(validateRecordingStart(free, { mode: 'screen', includeMic: true }), 'Microphone or system audio recording requires SnapFlow Pro');
  assert.equal(maxDurationMs(free), 5 * 60 * 1000);
});

test('history persists recording metadata', () => {
  const db = openDb(join(tmpdir(), `snapflow-rec-${randomUUID()}.db`));
  const history = new HistoryStore(db);
  const rec: Capture = {
    id: randomUUID(),
    workspaceId: 'ws_a',
    filename: 'Demo clip',
    imagePath: '/tmp/thumb.png',
    kind: 'recording',
    tag: 'recording',
    ocrText: 'Screen recording (12s)',
    hasPii: false,
    createdAt: Date.now(),
    mediaPath: '/tmp/clip.webm',
    durationMs: 12_000,
    byteSize: 400_000,
  };
  history.insert(rec);
  const loaded = history.get('ws_a', rec.id);
  assert.equal(loaded?.kind, 'recording');
  assert.equal(loaded?.tag, 'recording');
  assert.equal(loaded?.mediaPath, '/tmp/clip.webm');
  assert.equal(loaded?.durationMs, 12_000);
  assert.ok(history.search('ws_a', 'recording').length >= 1);
});
