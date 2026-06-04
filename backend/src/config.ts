// Runtime configuration. All secrets come from the environment.
export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? './snapflow-backend.db',
  // When set, the backend uses Postgres instead of SQLite (production).
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: process.env.DATA_DIR ?? '.',   // image blobs live under <dataDir>/blobs (object storage in prod)

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
};
