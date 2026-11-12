#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'resources');
const outFile = join(outDir, 'third-party-licenses.txt');

mkdirSync(outDir, { recursive: true });

const run = spawnSync(
  'npx',
  ['license-checker', '--production', '--out', outFile, '--plainVertical'],
  { cwd: root, encoding: 'utf8', shell: false },
);

if (run.status !== 0) {
  console.error(run.stderr || run.stdout || 'license-checker failed');
  process.exit(run.status ?? 1);
}

const banner = [
  'SnapFlow — third-party open-source licences (production dependencies)',
  'Generated at build time; draft until project licence is chosen. Do not treat as legal advice.',
  '---',
  '',
].join('\n');

writeFileSync(outFile, banner + readFileSync(outFile, 'utf8'));
console.log(`Wrote ${outFile}`);
