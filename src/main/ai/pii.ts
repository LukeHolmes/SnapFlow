// Local PII detection (architecture §7 / §11: runs fully on-device, no network).
// Email and phone are pattern-matched here. Name detection needs a small on-device
// model and is left as a documented extension — see README "Roadmap into the scaffold".

export interface PiiHit { type: 'email' | 'phone'; value: string; }

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Loose international phone shape; validated by digit count below to cut false positives.
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

export function detectPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  for (const m of text.matchAll(EMAIL)) hits.push({ type: 'email', value: m[0] });
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15) hits.push({ type: 'phone', value: m[0].trim() });
  }
  return hits;
}
