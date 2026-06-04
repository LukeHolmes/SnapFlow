import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, verifyToken } from '../src/auth/tokens';

test('issued token verifies and returns the account id', () => {
  const t = issueToken('acc_123');
  assert.deepEqual(verifyToken(t), { accountId: 'acc_123' });
});
test('tampered token is rejected', () => {
  const t = issueToken('acc_123');
  assert.equal(verifyToken(t.slice(0, -2) + 'xx'), null);
});
test('expired token is rejected', () => {
  assert.equal(verifyToken(issueToken('acc_123', -10)), null);
});
test('malformed token is rejected', () => {
  assert.equal(verifyToken('not-a-token'), null);
});
