import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PRELOAD_DIR = join(process.cwd(), 'out/preload');
const ALLOWED_REQUIRES = new Set(['electron']);

async function listPreloadJsFiles(): Promise<string[]> {
  const entries = await readdir(PRELOAD_DIR, { withFileTypes: true });
  return entries.filter(e => e.isFile() && e.name.endsWith('.js')).map(e => join(PRELOAD_DIR, e.name));
}

function findRequires(source: string): string[] {
  const reqs: string[] = [];
  const re = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) reqs.push(m[2]);
  return reqs;
}

test('built preload scripts only require electron', async () => {
  let files: string[];
  try {
    files = await listPreloadJsFiles();
  } catch {
    assert.fail('out/preload missing — run npm run build first');
  }
  assert.ok(files.length >= 5, 'expected at least five preload entry files');

  const offenders: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const req of findRequires(source)) {
      if (!ALLOWED_REQUIRES.has(req)) offenders.push(`${file}: require("${req}")`);
    }
  }

  const chunksDir = join(PRELOAD_DIR, 'chunks');
  try {
    const chunks = await readdir(chunksDir);
    if (chunks.length > 0) {
      offenders.push(`${chunksDir} must not exist after self-contained preload build (found ${chunks.length} chunk(s))`);
    }
  } catch {
    // no chunks directory — expected
  }

  assert.equal(offenders.length, 0, offenders.join('\n'));
});
