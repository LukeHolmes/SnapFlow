import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPii } from '../src/main/ai/pii';

test('detects an email address', () => {
  const hits = detectPii('Contact luke@snapflow.app for access');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'email');
});

test('detects a phone number but ignores short digit runs', () => {
  assert.equal(detectPii('Call +353 86 123 4567 today').filter(h => h.type === 'phone').length, 1);
  assert.equal(detectPii('Error code 4042 on line 12').filter(h => h.type === 'phone').length, 0);
});

test('clean text yields no hits', () => {
  assert.equal(detectPii('Just a normal screenshot of a button').length, 0);
});
