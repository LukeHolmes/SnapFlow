# Destination OAuth setup (v1.0)

SnapFlow stores provider tokens **only on the backend** in the encrypted vault (`backend/src/vault/`). The desktop app never persists OAuth secrets; it opens the authorize URL and listens for a `snapflow://` deep link when `APP_REDIRECT_URL` is set.

## Prerequisites

1. Backend running with `backend/.env` copied from `backend/.env.example`.
2. Desktop `.env` with `SNAPFLOW_AI_PROXY_URL` and `SNAPFLOW_API_TOKEN` (from `POST /auth/token` in dev, or account OAuth in prod).
3. `APP_REDIRECT_URL=snapflow://oauth/callback` on the backend so callbacks return to the Electron app.

Every provider uses the same callback pattern:

```
{OAUTH_REDIRECT_BASE}/auth/oauth/<provider>/callback
```

| Destination | OAuth route `provider` | Env vars |
|---|---|---|
| Slack | `slack` | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Notion | `notion` | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` |
| Gmail | `google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `github` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Jira | `jira` | `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` |

## Slack (free workspace)

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) → **From scratch**.
2. **OAuth & Permissions** → redirect URL `http://localhost:3001/auth/oauth/slack/callback` (use your production API host in prod).
3. **Bot token scopes**: `files:write`, `channels:read`, `groups:read`.
4. Install the app to your workspace and copy **Client ID** + **Client Secret** into `backend/.env`.
5. In SnapFlow → **Output Presets** → connect Slack, pick a channel, save preset.

Delivery uploads the PNG via Slack’s external upload API and posts to the selected channel.

## Notion (free plan)

1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Set redirect URI `http://localhost:3001/auth/oauth/notion/callback`.
3. Copy OAuth client ID/secret to `backend/.env`.
4. In Notion, open the target page → **⋯** → **Connect to** → select your integration (required for delivery).
5. Connect in SnapFlow, search/select the page, save preset.

Notion delivery appends an image block when a signed capture URL is available, plus a callout with metadata. If cloud sync is off, the blob was not uploaded, or PII blocked upload, delivery continues **text-only** with a note in the callout.

## Cloud sync and signed image URLs (free storage)

1. Enable **Account → Cloud sync** in the desktop app (Pro/Team; off by default).
2. Configure backend blob storage (local disk is fine for dev):
   - **Local:** `BLOB_STORAGE_DRIVER=local` and `DATA_DIR=.` (default).
   - **Cloudflare R2 (free tier):** create a bucket, S3 API token, then set  
     `BLOB_STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,  
     `S3_BUCKET=…`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`.
   - **Supabase Storage:** enable S3 protocol on the project bucket and use its endpoint/keys the same way.
3. Set `PUBLIC_BASE_URL` to the HTTPS origin Notion/GitHub can reach (your API host or reverse proxy).
4. Optional: `SIGNED_URL_TTL_MS` (default 7 days).

When you send to **Notion** or **GitHub**, the desktop uploads the PNG (if sync is on and PII is clear), then the backend returns an HMAC URL. **Jira** still attaches the file directly; the signed URL appears in the comment when available.

## Gmail (Google free tier)

1. Google Cloud Console → APIs & Services → enable **Gmail API**.
2. Create **OAuth client ID** (Web application).
3. Authorized redirect URI: `http://localhost:3001/auth/oauth/google/callback`.
4. Scope used: `https://www.googleapis.com/auth/gmail.send` only.
5. Copy client ID/secret to `backend/.env`, connect in SnapFlow, set recipient emails.

## Jira Cloud (free Atlassian developer app)

1. [developer.atlassian.com/console/myapps/](https://developer.atlassian.com/console/myapps/) → Create **OAuth 2.0 integration**.
2. Callback URL: `http://localhost:3001/auth/oauth/jira/callback`.
3. Scopes: `read:jira-user`, `read:jira-work`, `write:jira-work`, `offline_access`.
4. Copy Client ID/secret to `backend/.env`.
5. Preset: issue key (attach) or project key + summary (create issue).

## Disconnect

**Output Presets** → **Disconnect** calls `DELETE /v1/integrations/:destination` and removes the vault entry for that account.

## Desktop protocol handler

Electron registers `snapflow://` and handles:

- `snapflow://oauth/callback?oauth=connected&destination=slack`
- `snapflow://oauth/callback?oauth=error&destination=gmail&error=...`

Implemented in `src/main/deep-link.ts` (adapted from branch `cursor/oauth-deep-link-handler-26e9`, PR #11).
