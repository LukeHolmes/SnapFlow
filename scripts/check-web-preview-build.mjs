#!/usr/bin/env node
/**
 * Smoke-check the static browser preview build before it is deployed.
 *
 * The preview is a Vite build of the renderer that runs without Electron, so it
 * needs the in-memory mock API. If `VITE_ALLOW_WEB_MOCK` is not enabled the
 * bundle boots, throws "Set VITE_ALLOW_WEB_MOCK=true…", and leaves #root empty.
 * That regression is invisible to typecheck/tests because the build still
 * succeeds — this check fails the deploy instead.
 *
 * Usage: node scripts/check-web-preview-build.mjs [--dist <dir>] [--base </path/>]
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

const distDir = resolve(argValue('--dist', 'src/renderer/dist'));
const expectedBase = argValue('--base', '/SnapFlow/');
const indexPath = join(distDir, 'index.html');

const problems = [];
function fail(message) {
  problems.push(message);
}

if (!existsSync(indexPath)) {
  console.error(`✗ Web preview check: ${indexPath} not found. Run the web build first.`);
  process.exit(1);
}

const indexHtml = await readFile(indexPath, 'utf8');
const assetUrls = [
  ...indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
].map((m) => m[1]);

if (assetUrls.length === 0) {
  fail('index.html references no JS/CSS assets.');
}

for (const url of assetUrls) {
  if (!url.startsWith(expectedBase)) {
    fail(`asset "${url}" does not start with expected base "${expectedBase}".`);
    continue;
  }
  const file = join(distDir, url.slice(expectedBase.length));
  if (!existsSync(file)) {
    fail(`asset "${url}" is referenced but missing from the build output.`);
  }
}

const assetsDir = join(distDir, 'assets');
const jsFiles = existsSync(assetsDir)
  ? (await readdir(assetsDir)).filter((f) => f.endsWith('.js'))
  : [];
if (jsFiles.length === 0) {
  fail('no JavaScript bundles found in dist/assets.');
}

let bundle = '';
for (const file of jsFiles) {
  bundle += await readFile(join(assetsDir, file), 'utf8');
}

// A distinctive string from the mock capture fixtures proves the mock API is
// bundled. The thrown guard text proves it was compiled out.
if (!bundle.includes('Login page regression')) {
  fail('mock sample data is not bundled — the browser preview would have no data source.');
}
if (bundle.includes('Set VITE_ALLOW_WEB_MOCK=true to run the dashboard mock')) {
  fail('the disabled-mock guard survived the build — VITE_ALLOW_WEB_MOCK was not enabled.');
}

const csp = indexHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
if (csp && !csp.includes('https://fonts.googleapis.com')) {
  fail('CSP blocks the Google Fonts stylesheet used by the renderer.');
}

if (problems.length > 0) {
  console.error('✗ Web preview check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `✓ Web preview check passed (${assetUrls.length} assets, base ${expectedBase}, mock data bundled).`,
);
