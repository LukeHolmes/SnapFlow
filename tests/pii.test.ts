import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPii } from '../src/main/ai/pii';
import { locatePiiInOcr } from '../src/main/ai/pii-locate';

test('detects an email address', () => {
  const hits = detectPii('Contact luke@snapflow.app for access');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'email');
});

test('detects a phone number but ignores short digit runs', () => {
  assert.equal(detectPii('Call +353 86 123 4567 today').filter(h => h.type === 'phone').length, 1);
  assert.equal(detectPii('Error code 4042 on line 12').filter(h => h.type === 'phone').length, 0);
});

test('detects person names from dictionary + title case', () => {
  const hits = detectPii('Assigned to Luke Holmes before escalation.');
  const names = hits.filter(h => h.type === 'name');
  assert.ok(names.some(h => h.value.includes('Luke') && h.value.includes('Holmes')));
});

test('ignores common UI words that look like names', () => {
  const hits = detectPii('Press Submit to continue on Monday morning.');
  assert.equal(hits.filter(h => h.type === 'name').length, 0);
});

test('detects labeled single names', () => {
  const hits = detectPii('Patient name: Sarah\nNext appointment');
  assert.ok(hits.some(h => h.type === 'name' && h.value === 'Sarah'));
});

test('validates credit cards with Luhn only', () => {
  assert.ok(detectPii('Card 4111 1111 1111 1111').some(h => h.type === 'credit_card'));
  assert.equal(detectPii('Reference 4111 1111 1111 1112').filter(h => h.type === 'credit_card').length, 0);
});

test('detects IBAN with mod-97 check', () => {
  const text = 'Wire DE89370400440532013000 to treasury';
  assert.ok(detectPii(text).some(h => h.type === 'iban'));
});

test('detects IPv4 addresses', () => {
  assert.ok(detectPii('Server at 192.168.1.42 responded').some(h => h.type === 'ip'));
});

test('clean text yields no hits', () => {
  assert.equal(detectPii('Just a normal screenshot of a button').length, 0);
});

test('locatePiiInOcr maps email hits to word boxes', () => {
  const ocr = {
    text: 'Email test@example.com today',
    words: [
      { text: 'Email', bbox: { x0: 0, y0: 0, x1: 40, y1: 12 } },
      { text: 'test@example.com', bbox: { x0: 45, y0: 0, x1: 160, y1: 12 } },
      { text: 'today', bbox: { x0: 165, y0: 0, x1: 210, y1: 12 } },
    ],
  };
  const detections = locatePiiInOcr(ocr);
  assert.ok(detections.length >= 1);
  assert.equal(detections[0].type, 'email');
  assert.ok(detections[0].bbox.x1 > detections[0].bbox.x0);
});
