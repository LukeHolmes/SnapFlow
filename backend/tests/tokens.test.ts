import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueAccessToken, verifyAccessToken } from '../src/auth/tokens';

test('issued access token verifies and returns session id', () => {
  const t = issueAccessToken('acc_123', 'ses_unit', 3600);
  assert.deepEqual(verifyAccessToken(t), { accountId: 'acc_123', sessionId: 'ses_unit' });
});
test('tampered access token is rejected', () => {
  const t = issueAccessToken('acc_123', 'ses_unit', 3600);
  assert.equal(verifyAccessToken(t.slice(0, -2) + 'xx'), null);
});
test('expired access token is rejected', () => {
  assert.equal(verifyAccessToken(issueAccessToken('acc_123', 'ses_unit', -10)), null);
});
test('malformed token is rejected', () => {
  assert.equal(verifyAccessToken('not-a-token'), null);
});
