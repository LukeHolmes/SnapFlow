import test from 'node:test';
import assert from 'node:assert/strict';

test('parseExternalHttpsUrl accepts https only', async () => {
  const { parseExternalHttpsUrl } = await import('../src/main/shell-safe');
  assert.equal(parseExternalHttpsUrl('https://example.com/path').hostname, 'example.com');
  assert.throws(() => parseExternalHttpsUrl('http://example.com'), /https/i);
  assert.throws(() => parseExternalHttpsUrl('javascript:alert(1)'), /Invalid URL|https/i);
});
