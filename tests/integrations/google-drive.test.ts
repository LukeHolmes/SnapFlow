import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Capture } from '../../src/shared/types';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-gdrive-'));
const pngPath = join(dir, 'capture.png');
writeFileSync(pngPath, Buffer.from('png-test-bytes'));

let googleDriveDestination: typeof import('../../src/main/integrations/google-drive').googleDriveDestination;
let setGoogleDriveDeliverFetchForTests: typeof import('../../src/main/integrations/google-drive').setGoogleDriveDeliverFetchForTests;
let setGoogleDriveTokenStoreForTests: typeof import('../../src/main/integrations/google-drive/token-store').setGoogleDriveTokenStoreForTests;
let createMemoryTokenStore: typeof import('../../src/main/integrations/google-drive/token-store').createMemoryTokenStore;
let refreshAccessToken: typeof import('../../src/main/integrations/google-drive/oauth').refreshAccessToken;
let findFolderByName: typeof import('../../src/main/integrations/google-drive/drive-api').findFolderByName;
let createFolder: typeof import('../../src/main/integrations/google-drive/drive-api').createFolder;
let getGoogleDriveStatus: typeof import('../../src/main/integrations/google-drive/service').getGoogleDriveStatus;
let disconnectGoogleDrive: typeof import('../../src/main/integrations/google-drive/service').disconnectGoogleDrive;
let setGoogleDriveFetchForTests: typeof import('../../src/main/integrations/google-drive/service').setGoogleDriveFetchForTests;
let buildAuthorizeUrl: typeof import('../../src/main/integrations/google-drive/oauth').buildAuthorizeUrl;
let exchangeCodeForTokens: typeof import('../../src/main/integrations/google-drive/oauth').exchangeCodeForTokens;
let clearPendingOAuth: typeof import('../../src/main/integrations/google-drive/oauth').clearPendingOAuth;
let getPendingOAuth: typeof import('../../src/main/integrations/google-drive/oauth').getPendingOAuth;
let canUseGoogleDriveManualSend: typeof import('../../src/main/integrations/google-drive/tier-gates').canUseGoogleDriveManualSend;
let entitlementsFor: typeof import('../../src/main/entitlements').entitlementsFor;
let canUseDestinationEnt: typeof import('../../src/main/entitlements').canUseDestination;

const originalFetch = globalThis.fetch;
const originalClientId = process.env.GOOGLE_DRIVE_CLIENT_ID;

before(async () => {
  process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  ({ googleDriveDestination, setGoogleDriveDeliverFetchForTests } = await import('../../src/main/integrations/google-drive'));
  ({
    setGoogleDriveTokenStoreForTests,
    createMemoryTokenStore,
  } = await import('../../src/main/integrations/google-drive/token-store'));
  ({
    refreshAccessToken,
  } = await import('../../src/main/integrations/google-drive/oauth'));
  ({
    findFolderByName,
    createFolder,
  } = await import('../../src/main/integrations/google-drive/drive-api'));
  ({
    getGoogleDriveStatus,
    disconnectGoogleDrive,
    setGoogleDriveFetchForTests,
  } = await import('../../src/main/integrations/google-drive/service'));
  ({
    buildAuthorizeUrl,
    exchangeCodeForTokens,
    clearPendingOAuth,
    getPendingOAuth,
  } = await import('../../src/main/integrations/google-drive/oauth'));
  ({ canUseGoogleDriveManualSend } = await import('../../src/main/integrations/google-drive/tier-gates'));
  ({ entitlementsFor, canUseDestination: canUseDestinationEnt } = await import('../../src/main/entitlements'));
});

after(() => {
  globalThis.fetch = originalFetch;
  setGoogleDriveDeliverFetchForTests(null);
  setGoogleDriveTokenStoreForTests(null);
  setGoogleDriveFetchForTests(null);
  if (originalClientId === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_ID;
  else process.env.GOOGLE_DRIVE_CLIENT_ID = originalClientId;
  clearPendingOAuth();
  rmSync(dir, { recursive: true, force: true });
});

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: 'cap_gdrive',
    workspaceId: 'ws_local',
    filename: 'Bug.png',
    imagePath: pngPath,
    kind: 'screenshot',
    tag: 'ui',
    ocrText: 'Submit',
    hasPii: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  const impl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = impl;
  setGoogleDriveDeliverFetchForTests(impl);
  setGoogleDriveFetchForTests(impl);
}

test('manual Google Drive send is allowed on the free tier', () => {
  assert.equal(canUseGoogleDriveManualSend(), true);
  assert.equal(canUseDestinationEnt(entitlementsFor('free'), 'google-drive'), true);
});

test('status reflects missing client id configuration', async () => {
  const prev = process.env.GOOGLE_DRIVE_CLIENT_ID;
  delete process.env.GOOGLE_DRIVE_CLIENT_ID;
  const { isGoogleDriveConfigured } = await import('../../src/main/integrations/google-drive/config');
  assert.equal(isGoogleDriveConfigured(), false);
  const status = getGoogleDriveStatus();
  assert.match(status.message ?? '', /GOOGLE_DRIVE_CLIENT_ID/i);
  process.env.GOOGLE_DRIVE_CLIENT_ID = prev;
});

test('buildAuthorizeUrl requires configuration', () => {
  clearPendingOAuth();
  const url = buildAuthorizeUrl();
  assert.match(url, /accounts\.google\.com/);
  assert.ok(getPendingOAuth()?.verifier);
});

test('refreshAccessToken exchanges refresh token', async () => {
  mockFetch((url, init) => {
    assert.match(url, /oauth2\.googleapis\.com\/token/);
    const body = String(init?.body ?? '');
    assert.match(body, /refresh_token=rt-123/);
    return Response.json({ access_token: 'new-access', expires_in: 3600 });
  });
  const refreshed = await refreshAccessToken('rt-123');
  assert.equal(refreshed.access_token, 'new-access');
});

test('findFolderByName and createFolder call Drive query API', async () => {
  let created = false;
  mockFetch((url, init) => {
    if (url.includes('/files?') && url.includes('mimeType')) {
      return Response.json({ files: [{ id: 'folder-abc', name: 'SnapFlow' }] });
    }
    if (url.endsWith('/drive/v3/files') && init?.method === 'POST') {
      created = true;
      return Response.json({ id: 'folder-new' });
    }
    throw new Error(`Unexpected ${url}`);
  });
  const found = await findFolderByName('token', 'SnapFlow');
  assert.equal(found, 'folder-abc');
  const id = await createFolder('token', 'Other');
  assert.equal(id, 'folder-new');
  assert.equal(created, true);
});

test('deliver uploads via resumable session and returns webViewLink', async () => {
  const store = createMemoryTokenStore();
  setGoogleDriveTokenStoreForTests(store);
  store.write({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expiry_date: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/drive.file',
    email: 'user@example.com',
  });

  const steps: string[] = [];
  mockFetch((url, init) => {
    if (url.includes('uploadType=resumable') && init?.method === 'POST') {
      steps.push('init');
      return new Response(null, { status: 200, headers: { location: 'https://upload.example/session' } });
    }
    if (url === 'https://upload.example/session' && init?.method === 'PUT') {
      steps.push('upload');
      return Response.json({ id: 'file-99', webViewLink: 'https://drive.google.com/file/d/file-99/view' });
    }
    if (url.includes('/files?') && url.includes('SnapFlow')) {
      steps.push('folder');
      return Response.json({ files: [{ id: 'folder-1' }] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const result = await googleDriveDestination.deliver(capture(), { folder_name: 'SnapFlow' });
  assert.deepEqual(steps, ['folder', 'init', 'upload']);
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://drive.google.com/file/d/file-99/view');
});

test('deliver blocks captures with unresolved PII', async () => {
  const store = createMemoryTokenStore();
  setGoogleDriveTokenStoreForTests(store);
  store.write({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expiry_date: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/drive.file',
  });
  const result = await googleDriveDestination.deliver(capture({ hasPii: true }), {});
  assert.equal(result.ok, false);
  assert.match(result.detail, /PII/i);
});

test('deliver surfaces Drive API errors', async () => {
  const store = createMemoryTokenStore();
  setGoogleDriveTokenStoreForTests(store);
  store.write({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expiry_date: Date.now() + 60_000,
    scope: 'https://www.googleapis.com/auth/drive.file',
  });
  mockFetch((url) => {
    if (url.includes('/files?')) {
      return Response.json({ error: { message: 'Insufficient permissions' } }, { status: 403 });
    }
    throw new Error(url);
  });
  await assert.rejects(
    () => googleDriveDestination.deliver(capture(), {}),
    /Insufficient permissions/,
  );
});

test('exchangeCodeForTokens stores refreshable tokens', async () => {
  clearPendingOAuth();
  buildAuthorizeUrl();
  const ctx = getPendingOAuth();
  assert.ok(ctx);
  mockFetch((url) => {
    if (url.includes('/token')) {
      return Response.json({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/drive.file',
      });
    }
    if (url.includes('userinfo')) {
      return Response.json({ email: 'you@example.com' });
    }
    throw new Error(url);
  });
  const tokens = await exchangeCodeForTokens('auth-code', ctx!, fetch);
  assert.equal(tokens.refresh_token, 'rt');
  assert.equal(tokens.email, 'you@example.com');
});

test('disconnect revokes and clears the token store', async () => {
  const store = createMemoryTokenStore();
  setGoogleDriveTokenStoreForTests(store);
  store.write({
    access_token: 'a',
    refresh_token: 'r',
    expiry_date: Date.now() + 1000,
    scope: 'x',
  });
  let revoked = false;
  mockFetch((url) => {
    if (url.includes('/revoke')) {
      revoked = true;
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  });
  const result = await disconnectGoogleDrive();
  assert.equal(result.ok, true);
  assert.equal(revoked, true);
  assert.equal(store.read(), null);
});
