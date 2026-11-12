# SnapFlow v1.1.0 release checklist

Use this list for **on-device** validation before tagging `v1.1.0`. Cloud CI covers headless unit tests; these steps require macOS and/or Windows hardware.

## Capture & permissions

- [ ] **macOS** — Screen Recording permission prompt; region (⌘⇧4), window (⌘⇧5), scroll-stitch (⌘⇧6), colour picker (⌘⇧7).
- [ ] **Windows** — Screen capture consent; same shortcuts with Ctrl+Shift modifiers.
- [ ] **Electron 42** — `npm run dev` and packaged build launch; tray, global shortcuts, `snapflow://` protocol handler.

## Focus Blur & Diff

- [ ] Free account: one focus region; Pro: unlimited + preset automation on deliver (`docs/FOCUS_BLUR.md`).
- [ ] Diff mode: free basic views; Pro sensitivity slider and changed-region boxes.

## Screen recording (⌘⇧8 / Ctrl+Shift+8)

- [ ] Full screen, window picker, region; countdown; pause/stop overlay.
- [ ] **Pro** — mic + system audio where OS allows; **Free** — audio controls disabled.
- [ ] Max duration enforcement (5 min Free, 60 min Pro, 120 min Team).
- [ ] History playback; GIF export (Pro) on short clips.

## Cloud sync & signed URLs

- [ ] Account → enable cloud sync; `Sync now` uploads metadata + blobs.
- [ ] Delivery / public URL uses expiring `sig` + `exp` (no legacy URLs).

## Integrations (OAuth deep links)

- [ ] Backend running with provider env from `docs/DESTINATION_SETUP.md`.
- [ ] Connect Slack/Jira/Notion/Gmail/GitHub/Google Drive from Account; `snapflow://` callback returns to app.
- [ ] Deliver screenshot and recording (Drive `.webm`) from a preset.

## Team tier

- [ ] `POST /auth/token` or billing stub with `tier: "team"` on owner account.
- [ ] Create team, copy invite link, accept on second account (seat limit, single-use token).
- [ ] Share capture from History; second member opens library signed URL; removed member gets 403.
- [ ] Member on Pro billing account inherits Team entitlements (`GET /v1/entitlements`).

## Provider app registration (one-time per environment)

| Provider | Register | Redirect / notes |
|----------|----------|------------------|
| Google (Drive + login) | Google Cloud Console → OAuth client (desktop + web) | `snapflow://oauth/callback`, backend `GOOGLE_*` in `backend/.env` |
| GitHub | GitHub OAuth App | Callback URL on backend |
| Slack | Slack app | Bot + OAuth scopes per `DESTINATION_SETUP.md` |
| Notion, Jira, Gmail, Zapier | Per `docs/DESTINATION_SETUP.md` | Store client id/secret in `backend/.env` only |

Do **not** commit secrets. Use `.env.example` as the template.

## Release hardening (v1.1+)

- [ ] Packaged desktop defaults to **free** tier; `GET /v1/entitlements` when signed in (15 min cache).
- [ ] `SNAPFLOW_TIER` env honored **only** in unpackaged dev builds.
- [ ] Backend: `DEV_LOGIN` defaults **false**; `AUTH_SECRET` and `BILLING_WEBHOOK_SECRET` required in production.
- [ ] `POST /v1/billing/webhook` rejects unsigned requests when a webhook secret is set; checkout stub returns 503 in production.
- [ ] `POST /v1/deliver` returns **402** for free-tier accounts on server destinations.
- [ ] Dashboard CSP + `sandbox: true` on the main window; IPC inputs validated in main process.
- [ ] `snapflow://oauth/callback` deep links reject unknown paths/destinations.

## Before tag

- [ ] CI green on `main` (desktop + backend jobs, Windows installer job if touched).
- [ ] `CHANGELOG.md` `[1.1.0]` section complete.
- [ ] Version bump in root `package.json` when ready to release (not required for this hardening PR).
