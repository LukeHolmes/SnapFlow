# Integration runtime checklist (local dev)

Use this after registering OAuth apps in each provider console (secrets stay in dashboards until you paste them into local `.env` files). All flows below are **mock-tested in CI**; live connect still needs your machine, browser, and provider test users.

## Split runtimes

| Runtime | Role | OAuth clients |
|---------|------|----------------|
| **Backend** (`backend/`) | Vault, destination OAuth callbacks, delivery APIs | Slack, Notion, Gmail (Web), GitHub, Jira |
| **Desktop** (repo root) | UI, `snapflow://` deep links, Google Drive upload | Google Drive **Desktop PKCE** only (`GOOGLE_DRIVE_CLIENT_ID`) |

Gmail and Google Drive must use **different** Google OAuth clients (as registered Nov 10): Web client for Gmail on the backend; Desktop/loopback client for Drive on the device.

## Backend `backend/.env` (required for server-side destinations)

Copy from `backend/.env.example`. Minimum for integration dev:

| Variable | Purpose |
|----------|---------|
| `PORT` | Default `3001` |
| `AUTH_SECRET` | JWT signing (generate for non-dev) |
| `DEV_LOGIN=true` | `POST /auth/token` without account OAuth |
| `OAUTH_REDIRECT_BASE` | `http://localhost:3001` (must match console redirect hosts) |
| `APP_REDIRECT_URL` | `snapflow://oauth/callback` when using the Electron app |

Per provider (from provider dashboards — **never commit**):

| Variable | Redirect URI to register |
|----------|---------------------------|
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | `http://localhost:3001/auth/oauth/slack/callback` |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | `http://localhost:3001/auth/oauth/notion/callback` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `http://localhost:3001/auth/oauth/google/callback` (Gmail send scope only) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | `http://localhost:3001/auth/oauth/github/callback` |
| `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET` | `http://localhost:3001/auth/oauth/jira/callback` |

Optional: `VAULT_KEY` (32-byte hex), blob storage vars for signed capture URLs (Notion image embeds).

**Notion capabilities** (integration settings, not URL scopes): enable **read** + **insert content** so `/v1/search`, `/v1/users/me`, and block append work. Share target pages with the integration.

**Jira**: authorize URL includes `offline_access` for refresh tokens; scopes `read:jira-user read:jira-work write:jira-work`.

## Desktop `.env` (repo root)

| Variable | Purpose |
|----------|---------|
| `SNAPFLOW_AI_PROXY_URL` | `http://localhost:3001` |
| `SNAPFLOW_API_TOKEN` | From `POST /auth/token` (dev) or account login |
| `GOOGLE_DRIVE_CLIENT_ID` | Desktop OAuth client ID only (no secret) |
| `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` | Default `http://127.0.0.1:47823/oauth2callback` — must match Google **Desktop** client |

## Start order

```bash
cd backend && npm run dev          # tmux session; listens :3001
# root:
npm run dev                        # Electron; requires display + protocol handler
```

Without `APP_REDIRECT_URL`, OAuth callbacks return JSON (fine for curl/mock tests, not for the desktop UI).

## What still needs a real device later

- macOS/Windows screen capture and recording permissions
- Electron `snapflow://` handling after provider browser redirect
- Google **External Testing** consent + sole test user for Gmail/Drive projects
- Slack app install to workspace; Notion page sharing; Jira Cloud site access
- A **public HTTPS** `OAUTH_REDIRECT_BASE` / `PUBLIC_BASE_URL` for production (not documented yet)

## Prebuilt artifacts (no full repo checkout)

| Artifact | Platform | Interactive OAuth? |
|----------|----------|--------------------|
| CI **`snapflow-windows-installer`** (`dist/*.exe`) | Windows | Yes for backend destinations + Drive if `.env` configured |
| Backend `npm ci && npm run start` in `backend/` | Any Node 20+ host | Callback URLs only via browser; desktop deep link needs SnapFlow app |
| `npm run build` + Electron | Linux/macOS/Win from source | Linux has **no** CI installer target; build locally |

There is no published backend Docker image or standalone OAuth binary. For a second Linux machine: copy the repo or a release tag, install Node deps in `backend/`, set `backend/.env`, run `npm run start`, and use the desktop app (built or dev) on a machine that registers `snapflow://`.

## Verification (no live providers)

```bash
npm test && npm run typecheck
cd backend && npm test && npm run typecheck
```

Mocked flows cover: authorize URL shape, CSRF state, token exchange/refresh/disconnect, deep-link error parsing, Google Drive PKCE loopback path.
