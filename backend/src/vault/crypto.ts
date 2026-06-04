// AES-256-GCM encryption for the OAuth vault (architecture §7: encryption at rest).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { config } from '../config';

function key(): Buffer {
  if (config.vaultKey) return Buffer.from(config.vaultKey, 'hex');         // 32-byte hex in prod
  return createHash('sha256').update(`vault:${config.authSecret}`).digest(); // dev fallback
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(blob: string): string {
  const [ivS, tagS, encS] = blob.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivS, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagS, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encS, 'base64url')), decipher.final()]).toString('utf8');
}
