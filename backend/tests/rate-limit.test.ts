import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allow, _reset } from '../src/rate-limit';

test('allows up to the limit then blocks', () => {
  _reset();
  const key = 'acc_rl';
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (allow(key, 3)) allowed++;
  assert.equal(allowed, 3);            // 3 tokens, then blocked
  assert.equal(allow(key, 3), false);
});
test('separate accounts have separate buckets', () => {
  _reset();
  assert.equal(allow('a', 1), true);
  assert.equal(allow('b', 1), true);   // not affected by a
  assert.equal(allow('a', 1), false);
});
