import { createHash } from 'node:crypto';
import { evidenceConfig } from './config';

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function evidenceObjectPath(orgId: string, itemId: string, versionId: string): string {
  return `${orgId}/${itemId}/${versionId}_redacted.png`;
}

export async function uploadEvidencePng(
  path: string,
  body: Buffer,
  contentType = 'image/png',
): Promise<void> {
  const { supabaseUrl, supabaseServiceRoleKey } = evidenceConfig;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for evidence storage upload');
  }
  const url = `${supabaseUrl}/storage/v1/object/${evidenceConfig.storageBucket}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`storage upload failed: ${text}`), { status: res.status });
  }
}

export async function createSignedDownloadUrl(path: string): Promise<string> {
  const { supabaseUrl, supabaseServiceRoleKey, signedDownloadTtlSec, storageBucket } = evidenceConfig;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for signed URLs');
  }
  const url = `${supabaseUrl}/storage/v1/object/sign/${storageBucket}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: signedDownloadTtlSec }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`sign url failed: ${text}`), { status: res.status });
  }
  const json = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const signed = json.signedURL ?? json.signedUrl;
  if (!signed) throw new Error('missing signed URL in storage response');
  return signed.startsWith('http') ? signed : `${supabaseUrl}${signed}`;
}
