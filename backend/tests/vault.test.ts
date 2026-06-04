import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../src/vault/crypto';

test('encrypt -> decrypt round trips', () => {
  const secret = 'xoxb-slack-oauth-token-12345';
  const blob = encrypt(secret);
  assert.notEqual(blob, secret);
  assert.equal(decrypt(blob), secret);
});
test('ciphertext is non-deterministic (random IV)', () => {
  assert.notEqual(encrypt('same'), encrypt('same'));
});
test('tampered ciphertext fails authentication', () => {
  const blob = encrypt('secret');
  const [iv, tag, enc] = blob.split('.');
  assert.throws(() => decrypt([iv, tag, enc.slice(0, -2) + 'AA'].join('.')));
});
