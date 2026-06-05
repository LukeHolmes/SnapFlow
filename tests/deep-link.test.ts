import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLinkUrl } from '../src/main/deep-link';

test('parses a successful OAuth callback URL', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=connected&destination=slack');
  assert.deepEqual(result, { kind: 'connected', destination: 'slack' });
});

test('parses destination-only URL as connected', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?destination=notion');
  assert.deepEqual(result, { kind: 'connected', destination: 'notion' });
});

test('parses all valid destinations', () => {
  for (const dest of ['slack', 'notion', 'gmail', 'github', 'jira']) {
    const result = parseDeepLinkUrl(`snapflow://oauth/callback?oauth=connected&destination=${dest}`);
    assert.equal(result?.kind, 'connected');
    assert.equal(result?.destination, dest);
  }
});

test('parses an error callback URL', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?error=access_denied&destination=gmail');
  assert.deepEqual(result, { kind: 'error', destination: 'gmail', message: 'access_denied' });
});

test('parses error without destination', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?error=server_error');
  assert.deepEqual(result, { kind: 'error', destination: null, message: 'server_error' });
});

test('returns null for non-snapflow protocol', () => {
  assert.equal(parseDeepLinkUrl('https://example.com?destination=slack'), null);
});

test('returns null for malformed URL', () => {
  assert.equal(parseDeepLinkUrl('not a url at all'), null);
});

test('returns null for empty string', () => {
  assert.equal(parseDeepLinkUrl(''), null);
});

test('returns null for unknown destination', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=connected&destination=unknown');
  assert.equal(result, null);
});

test('returns null for snapflow URL with no relevant params', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?foo=bar');
  assert.equal(result, null);
});

test('handles URL-encoded destination parameter', () => {
  const result = parseDeepLinkUrl('snapflow://oauth/callback?oauth=connected&destination=slack&state=abc123');
  assert.deepEqual(result, { kind: 'connected', destination: 'slack' });
});
