import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { metadataComment } from './common';
import type { Capture } from '../../shared/types';
import { isGoogleDriveConfigured } from './google-drive/config';
import {
  ensureFolderId,
  getValidAccessToken,
  uploadPngFile,
  type FetchFn,
} from './google-drive/drive-api';
import {
  disconnectGoogleDrive,
  readGoogleDriveTokens,
  updateGoogleDriveTokens,
  setGoogleDriveFetchForTests,
} from './google-drive/service';

export interface GoogleDrivePresetConfig {
  folder_name?: string;
}

const DEFAULT_FOLDER = 'SnapFlow';

function copyUrlToClipboard(url: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require('electron') as typeof import('electron');
    clipboard.writeText(url);
  } catch {
    // Headless tests / non-Electron runners.
  }
}

async function deliverToDrive(
  capture: Capture,
  config: Record<string, unknown>,
  fetchImpl: FetchFn = fetch,
) {
  if (!isGoogleDriveConfigured()) {
    return { ok: false, detail: 'Google Drive is not configured — set GOOGLE_DRIVE_CLIENT_ID in .env' };
  }

  const tokens = readGoogleDriveTokens();
  if (!tokens?.refresh_token) throw new NotConfiguredError('Google Drive');

  if (capture.hasPii) {
    return {
      ok: false,
      detail: 'PII detected on this capture — review PII Redaction and save a redacted copy before uploading',
    };
  }

  const folderName = typeof config.folder_name === 'string' && config.folder_name.trim()
    ? config.folder_name.trim()
    : DEFAULT_FOLDER;

  const accessToken = await getValidAccessToken(tokens, updateGoogleDriveTokens, fetchImpl);
  const folderId = await ensureFolderId(accessToken, folderName, fetchImpl);
  const filePath = capture.kind === 'recording' && capture.mediaPath ? capture.mediaPath : capture.imagePath;
  const upload = await uploadPngFile(
    accessToken,
    filePath,
    folderId,
    metadataComment(capture),
    fetchImpl,
  );

  copyUrlToClipboard(upload.webViewLink);
  return {
    ok: true,
    detail: `Uploaded to Google Drive folder “${folderName}” — link copied to clipboard`,
    url: upload.webViewLink,
  };
}

let deliverFetchOverride: FetchFn | null = null;

export function setGoogleDriveDeliverFetchForTests(impl: FetchFn | null): void {
  deliverFetchOverride = impl;
  setGoogleDriveFetchForTests(impl);
}

export const googleDriveDestination: OutputDestination = {
  id: 'google-drive',
  label: 'Google Drive',
  requiresAuth: true,
  async deliver(capture, config) {
    const fetchImpl = deliverFetchOverride ?? fetch;
    return deliverToDrive(capture, config, fetchImpl);
  },
};

export { disconnectGoogleDrive };
