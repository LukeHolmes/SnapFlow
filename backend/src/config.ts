// Runtime configuration. All secrets come from the environment.

const DEV_AUTH_SECRET = 'dev-insecure-secret-change-me';

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultWhenUnset;
  return raw !== 'false' && raw !== '0';
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

// HMAC secret for bearer tokens — dev-only default; production must set AUTH_SECRET explicitly.
const authSecret = process.env.AUTH_SECRET ?? DEV_AUTH_SECRET;

// Runtime configuration object (validated at startup via validateConfig()).
export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? './snapflow-backend.db',
  // When set, the backend uses Postgres instead of SQLite (production).
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: process.env.DATA_DIR ?? '.',   // local blob driver root is <dataDir>/blobs

  // Short-lived HMAC capture URLs (Notion / GitHub / Jira). Default 24 hours.
  signedUrlTtlMs: Number(process.env.SIGNED_URL_TTL_MS ?? 24 * 60 * 60 * 1000),

  /** HMAC secret for public capture share links (distinct from AUTH_SECRET). */
  shareLinkSecret: process.env.SHARE_LINK_SECRET ?? '',

  // Blob storage: `local` (disk under DATA_DIR) or `s3` (R2, MinIO, Supabase S3 API, etc.)
  blobStorageDriver: (process.env.BLOB_STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: process.env.S3_REGION ?? 'auto',
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  // Path-style URLs (required for many S3-compatible providers).
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',

  authSecret,

  /** Short-lived API access tokens (seconds). Default 15 minutes. */
  accessTokenTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 15 * 60),
  /** Refresh token lifetime for desktop sessions (milliseconds). Default 30 days. */
  refreshTokenTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000),

  // 32-byte hex key for the OAuth vault (AES-256-GCM). If empty, derived from
  // authSecret for dev only — set a real VAULT_KEY in production.
  vaultKey: process.env.VAULT_KEY ?? '',

  // Vision model for auto-tagging. If no key is set, a deterministic offline
  // stub is used so the proxy still runs and is testable.
  aiApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Set AI_MODEL to your provider's current model id.
  aiModel: process.env.AI_MODEL ?? 'claude-3-5-sonnet-latest',
  aiRatePerMin: Number(process.env.AI_RATE_PER_MIN ?? 30),
  slackApiBase: process.env.SLACK_API_BASE ?? 'https://slack.com/api',
  notionApiBase: process.env.NOTION_API_BASE ?? 'https://api.notion.com',
  gmailApiBase: process.env.GMAIL_API_BASE ?? 'https://gmail.googleapis.com',
  githubApiBase: process.env.GITHUB_API_BASE ?? 'https://api.github.com',
  jiraAuthBase: process.env.JIRA_AUTH_BASE ?? 'https://auth.atlassian.com',
  jiraApiBase: process.env.JIRA_API_BASE ?? 'https://api.atlassian.com',
  jiraClientId: process.env.JIRA_CLIENT_ID ?? '',
  jiraClientSecret: process.env.JIRA_CLIENT_SECRET ?? '',
  // OAuth login
  oauthRedirectBase: process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3001',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:3001',
  appRedirectUrl: process.env.APP_REDIRECT_URL ?? '',   // deep link back into the desktop app
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  slackClientId: process.env.SLACK_CLIENT_ID ?? '',
  slackClientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
  notionClientId: process.env.NOTION_CLIENT_ID ?? '',
  notionClientSecret: process.env.NOTION_CLIENT_SECRET ?? '',
  // Dev email→token login. Defaults off; set DEV_LOGIN=true for local dev/tests only.
  devLogin: envFlag('DEV_LOGIN', false),

  /** HMAC secret for POST /v1/billing/webhook signatures (Stripe-style). Required in production. */
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET ?? '',

  /** Default seat cap for new teams (free/dev; production maps to purchased seats via billing). */
  teamDefaultSeatLimit: Number(process.env.TEAM_DEFAULT_SEAT_LIMIT ?? 5),
  /** Single-use team invite link TTL (default 7 days). */
  teamInviteTtlMs: Number(process.env.TEAM_INVITE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
};

const MIN_AUTH_SECRET_LENGTH = 32;

/** Fail fast when production env is misconfigured. Call before listening. */
export function validateConfig(cfg: typeof config = config): void {
  if (cfg.isProduction) {
    if (cfg.devLogin) {
      throw new Error('DEV_LOGIN must be false when NODE_ENV=production');
    }
    if (!process.env.AUTH_SECRET || cfg.authSecret === DEV_AUTH_SECRET) {
      throw new Error('AUTH_SECRET must be set to a unique value in production (not the dev default)');
    }
    if (cfg.authSecret.length < MIN_AUTH_SECRET_LENGTH) {
      throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters in production`);
    }
    const shareSecret = cfg.shareLinkSecret || process.env.SHARE_LINK_SECRET;
    if (!shareSecret || shareSecret === cfg.authSecret || shareSecret.length < MIN_AUTH_SECRET_LENGTH) {
      throw new Error('SHARE_LINK_SECRET must be set to a unique value (≥32 chars) in production');
    }
    if (!cfg.vaultKey || cfg.vaultKey.length !== 64) {
      throw new Error('VAULT_KEY must be set to 32-byte hex (64 characters) in production');
    }
    if (!cfg.billingWebhookSecret || cfg.billingWebhookSecret.length < MIN_AUTH_SECRET_LENGTH) {
      throw new Error('BILLING_WEBHOOK_SECRET must be set (≥32 chars) in production');
    }
  }
}

export const __devAuthSecretDefault = DEV_AUTH_SECRET;
