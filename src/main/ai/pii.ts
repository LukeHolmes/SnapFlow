// Local PII detection (architecture §7 / §11: runs fully on-device, no network).
// Regex + dictionary/heuristic names, Luhn cards, IBAN mod-97, IPv4.

import { FIRST_NAMES, LAST_NAMES, PII_NAME_STOPWORDS } from './pii-names-data';

export type PiiType = 'email' | 'phone' | 'name' | 'credit_card' | 'iban' | 'ip';

export interface PiiHit { type: PiiType; value: string; }

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IBAN_CANDIDATE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;
const CC_CANDIDATE = /\b(?:\d{4}[\s-]?){3}\d{1,7}\b|\b\d{13,19}\b/g;

const TITLE_WORD = /\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\b/g;
const NAME_PREFIX_STOP = new Set([
  'assigned', 'contact', 'called', 'from', 'dear', 'hello', 'patient', 'customer', 'employee',
  'signed', 'author', 'prepared', 'escalation', 'manager', 'owner', 'user', 'client',
]);

function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const block = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of block) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function isNameDictionaryToken(word: string): boolean {
  const lower = word.toLowerCase();
  return FIRST_NAMES.has(lower) || LAST_NAMES.has(lower);
}

function pushUnique(hits: PiiHit[], type: PiiType, value: string): void {
  const norm = value.trim();
  if (!norm) return;
  if (hits.some(h => h.type === type && h.value === norm)) return;
  hits.push({ type, value: norm });
}

function detectNames(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const titleWords: string[] = [];
  for (const m of text.matchAll(TITLE_WORD)) titleWords.push(m[1]);

  for (let i = 0; i < titleWords.length; i += 1) {
    for (const len of [2, 3] as const) {
      if (i + len > titleWords.length) continue;
      const parts = titleWords.slice(i, i + len);
      if (parts.some(p => PII_NAME_STOPWORDS.has(p.toLowerCase()))) continue;
      if (NAME_PREFIX_STOP.has(parts[0].toLowerCase())) continue;

      const dictHits = parts.filter(isNameDictionaryToken).length;
      if (len === 2 && dictHits < 2) continue;
      if (len === 3 && dictHits < 2) continue;

      pushUnique(hits, 'name', parts.join(' '));
    }
  }

  const labelPatterns = [
    /(?:^|[\n\r])[^\n]{0,80}?\b(?:patient\s+)?name\s*:\s*([A-Z][a-z]+)/gim,
    /(?:^|[\n\r])[^\n]{0,80}?\bcontact\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gim,
  ];
  for (const re of labelPatterns) {
    for (const m of text.matchAll(re)) {
      const token = m[1].trim();
      if (PII_NAME_STOPWORDS.has(token.toLowerCase())) continue;
      if (isNameDictionaryToken(token.split(/\s+/)[0]) || isNameDictionaryToken(token.split(/\s+/).pop()!)) {
        pushUnique(hits, 'name', token);
      }
    }
  }

  return hits;
}

function detectIpv4(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  for (const m of text.matchAll(IPV4)) {
    const value = m[0];
  // Skip obvious placeholders / localhost noise in docs (still flag real LAN if user wants toggles)
    if (value === '0.0.0.0' || value === '255.255.255.255') continue;
    pushUnique(hits, 'ip', value);
  }
  return hits;
}

export function detectPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];

  for (const m of text.matchAll(EMAIL)) pushUnique(hits, 'email', m[0]);
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15) pushUnique(hits, 'phone', m[0].trim());
  }

  for (const m of text.matchAll(CC_CANDIDATE)) {
    const digits = m[0].replace(/\D/g, '');
    if (luhnValid(digits)) pushUnique(hits, 'credit_card', m[0].trim());
  }

  for (const m of text.matchAll(IBAN_CANDIDATE)) {
    if (ibanValid(m[0])) pushUnique(hits, 'iban', m[0].replace(/\s/g, '').toUpperCase());
  }

  hits.push(...detectIpv4(text));
  hits.push(...detectNames(text));

  return hits;
}

/** Normalise OCR snippets for fuzzy box matching (phones/emails). */
export function normalisePiiMatchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

export function isWordyNameHit(value: string): boolean {
  return /\s/.test(value.trim());
}
