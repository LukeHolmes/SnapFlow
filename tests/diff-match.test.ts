import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureBaseName, findPreviousCapture } from '../src/main/diff/match';
import type { Capture } from '../src/shared/types';

const cap = (id: string, filename: string, age: number): Capture => ({
  id,
  workspaceId: 'ws',
  filename,
  imagePath: `/tmp/${id}.png`,
  tag: 'ui',
  ocrText: '',
  hasPii: false,
  createdAt: Date.now() - age,
});

test('captureBaseName strips diff/annotated suffixes', () => {
  assert.equal(captureBaseName('Chrome — App annotated'), 'Chrome — App');
  assert.equal(captureBaseName('Region capture diff'), 'Region capture');
});

test('findPreviousCapture matches same window name', () => {
  const list = [
    cap('c3', 'Chrome — SnapFlow', 0),
    cap('c2', 'Chrome — SnapFlow annotated', 60_000),
    cap('c1', 'VS Code', 120_000),
    cap('c0', 'Chrome — SnapFlow', 180_000),
  ];
  const prev = findPreviousCapture(list, 'c3');
  assert.ok(prev);
  assert.equal(prev!.id, 'c2');
});
