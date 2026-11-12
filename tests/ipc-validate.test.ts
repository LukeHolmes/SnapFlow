import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCaptureId,
  assertDestinationId,
  assertHistoryLimit,
  IpcValidationError,
} from '../src/main/ipc-validate';

test('assertCaptureId accepts safe ids', () => {
  assert.equal(assertCaptureId('cap_123-abc'), 'cap_123-abc');
});

test('assertCaptureId rejects injection-ish ids', () => {
  assert.throws(() => assertCaptureId('../etc/passwd'), IpcValidationError);
  assert.throws(() => assertCaptureId(''), IpcValidationError);
});

test('assertHistoryLimit bounds', () => {
  assert.equal(assertHistoryLimit(50), 50);
  assert.throws(() => assertHistoryLimit(0), IpcValidationError);
  assert.throws(() => assertHistoryLimit(9999), IpcValidationError);
});

test('assertDestinationId whitelist', () => {
  assert.equal(assertDestinationId('slack'), 'slack');
  assert.throws(() => assertDestinationId('ftp'), IpcValidationError);
});
