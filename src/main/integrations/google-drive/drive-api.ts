import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import { DRIVE_API_BASE, DRIVE_UPLOAD_BASE } from './config';
import type { GoogleDriveTokens } from './token-store';
import { refreshAccessToken } from './oauth';

export class DriveApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export type FetchFn = typeof fetch;

export interface UploadResult {
  id: string;
  webViewLink: string;
}

async function parseError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    if (json.error?.message) return json.error.message;
  } catch { /* ignore */ }
  return `Drive API error (${res.status})`;
}

export async function getValidAccessToken(
  tokens: GoogleDriveTokens,
  onUpdate: (next: GoogleDriveTokens) => void,
  fetchImpl: FetchFn = fetch,
): Promise<string> {
  if (tokens.expiry_date > Date.now()) return tokens.access_token;
  const refreshed = await refreshAccessToken(tokens.refresh_token, fetchImpl);
  const next = { ...tokens, access_token: refreshed.access_token, expiry_date: refreshed.expiry_date };
  onUpdate(next);
  return next.access_token;
}

function escapeDriveQueryString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findFolderByName(
  accessToken: string,
  folderName: string,
  fetchImpl: FetchFn = fetch,
): Promise<string | null> {
  const q = `name='${escapeDriveQueryString(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `${DRIVE_API_BASE}/files?${new URLSearchParams({
    q,
    fields: 'files(id,name)',
    pageSize: '10',
    spaces: 'drive',
  }).toString()}`;

  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new DriveApiError(await parseError(res), res.status);
  const json = (await res.json()) as { files?: { id: string }[] };
  const match = json.files?.[0];
  return match?.id ?? null;
}

export async function createFolder(
  accessToken: string,
  folderName: string,
  fetchImpl: FetchFn = fetch,
): Promise<string> {
  const res = await fetchImpl(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!res.ok) throw new DriveApiError(await parseError(res), res.status);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new DriveApiError('Drive did not return a folder id');
  return json.id;
}

export async function ensureFolderId(
  accessToken: string,
  folderName: string,
  fetchImpl: FetchFn = fetch,
): Promise<string> {
  const existing = await findFolderByName(accessToken, folderName, fetchImpl);
  if (existing) return existing;
  return createFolder(accessToken, folderName, fetchImpl);
}

/** Resumable upload (works for any size; multipart initiation for metadata). */
export async function uploadPngFile(
  accessToken: string,
  imagePath: string,
  folderId: string,
  description: string,
  fetchImpl: FetchFn = fetch,
): Promise<UploadResult> {
  const name = basename(imagePath).endsWith('.png') ? basename(imagePath) : `${basename(imagePath, '.png') || 'capture'}.png`;
  const size = statSync(imagePath).size;
  const mimeType = 'image/png';

  const initRes = await fetchImpl(`${DRIVE_UPLOAD_BASE}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': mimeType,
      'x-upload-content-length': String(size),
    },
    body: JSON.stringify({
      name,
      parents: [folderId],
      description,
      mimeType,
    }),
  });

  if (!initRes.ok) throw new DriveApiError(await parseError(initRes), initRes.status);
  const sessionUrl = initRes.headers.get('location');
  if (!sessionUrl) throw new DriveApiError('Drive resumable upload missing session URL');

  if (size <= 5 * 1024 * 1024) {
    const fileBuf = await readFileToBuffer(imagePath);
    const putRes = await fetchImpl(sessionUrl, {
      method: 'PUT',
      headers: {
        'content-type': mimeType,
        'content-length': String(size),
      },
      body: new Uint8Array(fileBuf),
    });
    if (!putRes.ok) throw new DriveApiError(await parseError(putRes), putRes.status);
    const json = (await putRes.json()) as { id?: string; webViewLink?: string };
    if (!json.id) throw new DriveApiError('Upload succeeded but file id is missing');
    return { id: json.id, webViewLink: json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view` };
  }

  const stream = createReadStream(imagePath);
  const putRes = await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'content-length': String(size),
    },
    body: stream as unknown as BodyInit,
    duplex: 'half',
  } as RequestInit);
  if (!putRes.ok) throw new DriveApiError(await parseError(putRes), putRes.status);
  const json = (await putRes.json()) as { id?: string; webViewLink?: string };
  if (!json.id) throw new DriveApiError('Upload succeeded but file id is missing');
  return { id: json.id, webViewLink: json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view` };
}

async function readFileToBuffer(imagePath: string): Promise<Buffer> {
  const { readFileSync } = await import('node:fs');
  return readFileSync(imagePath);
}
