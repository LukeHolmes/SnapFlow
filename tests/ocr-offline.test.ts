import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

test('bundled eng.traineddata is present for offline OCR', async () => {
  const repoRoot = join(import.meta.dirname, '..');
  const trained = join(repoRoot, 'resources/tesseract/eng.traineddata');
  assert.ok(existsSync(trained), 'resources/tesseract/eng.traineddata must be bundled');
});
