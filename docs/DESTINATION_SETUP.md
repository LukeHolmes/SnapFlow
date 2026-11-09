# Destination OAuth setup (v1.0)

SnapFlow stores most provider tokens **only on the backend** in the encrypted vault (`backend/src/vault/`). The desktop app opens the authorize URL and listens for a `snapflow://` deep link when `APP_REDIRECT_URL` is set.

**Exception — Google Drive:** manual “Send to Google Drive” uploads **directly from the desktop** to the Google Drive API (`drive.file` scope). OAuth tokens for Drive live on the device (OS keychain via Electron `safeStorage` when available), not in the backend vault.

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
| Google Drive (desktop) | — | `GOOGLE_DRIVE_CLIENT_ID` on the **desktop** `.env` only |

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

Notion delivery appends an image block (signed capture URL) and a callout with metadata. **Pro/Team cloud sync** must upload the capture blob so the public signed URL works.

## Google Drive — desktop upload (free manual send)

Use this when you want captures in your own Google Drive without routing images through the SnapFlow backend. **Manual send is free**; auto-upload / per-folder rules are reserved for Pro/Team later.

1. [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External (or Internal for Workspace) → add test users while in “Testing”.
4. **Credentials → Create credentials → OAuth client ID**:
   - **Desktop app** (recommended): SnapFlow uses PKCE with loopback redirect `http://127.0.0.1:47823/oauth2callback` by default.
   - Or **Web application** with authorized redirect URI `snapflow://oauth/callback` if you set `GOOGLE_DRIVE_OAUTH_REDIRECT_URI=snapflow://oauth/callback` in the desktop `.env` (requires the app to handle the deep link).
5. Copy **only the Client ID** into the desktop `.env` as `GOOGLE_DRIVE_CLIENT_ID=` (no client secret on the desktop; PKCE public client).
6. Restart the desktop app → **Output Presets** → **Google Drive** → **Connect Google Drive**, optional folder name (default `SnapFlow`), **Save preset**.

Scope requested: `https://www.googleapis.com/auth/drive.file` (files the app creates/opens only).

Upload uses a resumable Drive upload from the desktop. On success, the file’s `webViewLink` is copied to the clipboard and shown in the activity toast. **Disconnect** revokes the refresh token at Google and deletes local encrypted tokens.

Until Luke registers the live OAuth app, leaving `GOOGLE_DRIVE_CLIENT_ID` unset disables the integration gracefully (status explains what to configure).

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
