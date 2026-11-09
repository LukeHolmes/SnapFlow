import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLinkUrl } from '../src/main/deep-link';

test('parseDeepLinkUrl accepts connected callback from the backend', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=connected&destination=slack');
  assert.deepEqual(result, { kind: 'connected', destination: 'slack' });
});

test('parseDeepLinkUrl accepts destination-only success links', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?destination=notion');
  assert.deepEqual(result, { kind: 'connected', destination: 'notion' });
});

test('parseDeepLinkUrl surfaces provider errors', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=error&destination=gmail&error=access_denied');
  assert.equal(result?.kind, 'error');
  assert.equal(result?.destination, 'gmail');
  assert.equal(result?.message, 'access_denied');
});

test('parseDeepLinkUrl rejects non-snapflow protocols', () => {
  assert.equal(parseDeepLinkUrl('https://example.com?destination=slack'), null);
});

test('parseDeepLinkUrl rejects unknown destinations on error', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=error&error=boom');
  assert.equal(result?.kind, 'error');
  assert.equal(result?.destination, null);
});
