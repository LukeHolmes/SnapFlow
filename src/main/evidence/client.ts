import { backendBaseUrl, readStoredApiToken } from '../auth/token-store';

type Json = Record<string, unknown>;

async function evidenceFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readStoredApiToken();
  const base = backendBaseUrl();
  if (!token || !base) throw new Error('Evidence sync requires backend sign-in');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string>),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Json & { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message ?? body.error ?? `Evidence API ${res.status}`);
  return body as T;
}

export async function apiCreateEvidenceItem(payload: Json): Promise<{ id: string }> {
  return evidenceFetch('/v1/evidence/items', { method: 'POST', body: JSON.stringify(payload) });
}

export async function apiUploadRedactedVersion(
  itemId: string,
  payload: Json,
): Promise<{ versionId: string }> {
  return evidenceFetch(`/v1/evidence/items/${itemId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCreatePack(payload: Json): Promise<{ packId: string; manifestHash: string }> {
  return evidenceFetch('/v1/evidence/packs', { method: 'POST', body: JSON.stringify(payload) });
}

export async function apiSignPack(
  packId: string,
  payload: Json,
): Promise<{ signatureId: string; signedPayloadHash: string }> {
  return evidenceFetch(`/v1/evidence/packs/${packId}/signatures`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiExportPack(packId: string): Promise<Json> {
  return evidenceFetch(`/v1/evidence/packs/${packId}/export`, { method: 'GET' });
}
