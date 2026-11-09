// Runtime configuration. All secrets come from the environment.
export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? './snapflow-backend.db',
  // When set, the backend uses Postgres instead of SQLite (production).
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: process.env.DATA_DIR ?? '.',   // local blob driver root is <dataDir>/blobs

  // Short-lived HMAC capture URLs (Notion / GitHub / Jira). Default 7 days.
  signedUrlTtlMs: Number(process.env.SIGNED_URL_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),

  // Blob storage: `local` (disk under DATA_DIR) or `s3` (R2, MinIO, Supabase S3 API, etc.)
  blobStorageDriver: (process.env.BLOB_STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: process.env.S3_REGION ?? 'auto',
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  // Path-style URLs (required for many S3-compatible providers).
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',

  // HMAC secret for bearer tokens. MUST be overridden in production.
  authSecret: process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me',

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
  // Dev email→token login. Set DEV_LOGIN=false in production (OAuth only).
  devLogin: (process.env.DEV_LOGIN ?? 'true') !== 'false',

  /** Default seat cap for new teams (free/dev; production maps to purchased seats via billing). */
  teamDefaultSeatLimit: Number(process.env.TEAM_DEFAULT_SEAT_LIMIT ?? 5),
  /** Single-use team invite link TTL (default 7 days). */
  teamInviteTtlMs: Number(process.env.TEAM_INVITE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
};
