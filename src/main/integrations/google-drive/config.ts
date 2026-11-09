export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DEFAULT_LOOPBACK_REDIRECT = 'http://127.0.0.1:47823/oauth2callback';

export function googleDriveClientId(): string | undefined {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  return id || undefined;
}

export function googleDriveOAuthRedirectUri(): string {
  return (process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim() || DEFAULT_LOOPBACK_REDIRECT);
}

export function isGoogleDriveConfigured(): boolean {
  return !!googleDriveClientId();
}

export const GOOGLE_OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_REVOKE = 'https://oauth2.googleapis.com/revoke';
export const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
