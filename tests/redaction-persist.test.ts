import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import { redactBoxesOnPng } from '../src/main/capture/redact-png';

test('redactBoxesOnPng paints boxes with solid mask colour', () => {
  const png = new PNG({ width: 40, height: 20 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) * 4;
      png.data[idx] = 200;
      png.data[idx + 1] = 40;
      png.data[idx + 2] = 10;
      png.data[idx + 3] = 255;
    }
  }
  redactBoxesOnPng(png, [{ x0: 8, y0: 4, x1: 20, y1: 12 }]);
  const masked = png.data[(png.width * 8 + 12) * 4];
  assert.equal(masked, 17);
  assert.equal(png.data[(png.width * 8 + 12) * 4 + 1], 17);
  assert.equal(png.data[(png.width * 8 + 12) * 4 + 2], 17);
  const unmasked = png.data[(png.width * 2 + 2) * 4];
  assert.equal(unmasked, 200);
});

test('stats piiRedacted counts saved redacted copies only', () => {
  const db = openDb(join(tmpdir(), `snapflow-pii-stat-${randomUUID()}.db`));
  const history = new HistoryStore(db);
  history.insert({
    id: randomUUID(), workspaceId: 'ws_a', filename: 'scan hit', imagePath: '/a.png',
    kind: 'screenshot', tag: null, ocrText: 'email', hasPii: true, createdAt: Date.now(),
  });
  history.insert({
    id: randomUUID(), workspaceId: 'ws_a', filename: 'masked redacted', imagePath: '/b.png',
    kind: 'screenshot', tag: null, ocrText: '', hasPii: false, piiRedactedApplied: true, createdAt: Date.now(),
  });
  const s = history.stats('ws_a');
  assert.equal(s.total, 2);
  assert.equal(s.piiRedacted, 1);
});
