# Changelog

All notable changes to SnapFlow. Semantic versioning (architecture §9: acquisition readiness).

## [0.6.1] — Unreleased — Project health
### Added
- **Cloud sync signed URLs** — pluggable blob storage (`local` + S3-compatible/R2/Supabase),
  expiring HMAC capture links (`exp` + `sig`), verify/revoke APIs, and destination fallbacks
  when no public URL exists. Desktop cloud sync is **opt-in** (Account); blobs upload on
  delivery to URL-based destinations or manual Sync now; PII-tagged captures skip upload.
- **Windows CI installer** — CI job on `windows-latest` builds an unsigned NSIS `.exe`
  (`npm run dist -- --publish never`) and uploads **`snapflow-windows-installer`** as a
  workflow artifact on `main`, PRs into `main`, and `workflow_dispatch` (see README).
- **PII name detection** — on-device dictionary/heuristic name matching alongside email/phone; optional card (Luhn), IBAN, and IPv4 checks; OCR bounding boxes with a toggleable redact review modal before saving a blurred copy.
- **Screen colour picker (v1.0 MVP)** — ⌘⇧7 / dashboard **Colour** / tray menu: multi-display overlay, magnified loupe, click-to-copy (HEX default, RGB/HSL via picker keys or dashboard setting), local recent-colour history in SQLite, Esc to cancel.
- **Snipping suite (consolidated)** — Documents and tests for features that landed via PR #6/#7: guided scroll-stitch preview (⌘⇧6), pinned captures, guide builder, and post-capture quick actions (copy / annotate / pin / OCR / redact / send). Scroll overlap logic extracted to `src/main/capture/stitch.ts` with headless unit tests.
- Callout annotations default to a readable white fill (92% opacity) unless the user sets transparency.
- **CI** — GitHub Actions workflow (`.github/workflows/ci.yml`): desktop + backend typecheck and tests.
- **Destination integrations (v1.0)** — OAuth connect/disconnect for Slack, Jira, Notion, Gmail, and GitHub; `snapflow://` deep-link callbacks in the desktop app; clearer delivery/auth error messages; `docs/DESTINATION_SETUP.md` and expanded `backend/.env.example`.
- README **v1.0 MVP status** table (done / partial / not started) aligned with the code on `main`.
- Shared TypeScript contract file (`src/shared/types.ts`) restored so IPC, stores, tests,
  and renderer code compile against one source of truth.
- Root and backend `.env.example` files for local desktop/backend configuration.
- npm lockfiles for reproducible root and backend installs.
- `.gitignore` for generated dependencies, build output, local env files, SQLite files,
  blobs, and logs.
### Removed
- Orphan **`eng.traineddata`** at repo root — OCR uses `tesseract.js`, which downloads English
  language data on first use; the file was not referenced anywhere in the tree.

### Changed
- Root `package.json` **version set to 0.6.1** to match this changelog track (was stuck at 0.5.0).
- Native `better-sqlite3` rebuild workflow is explicit:
  `npm test` rebuilds for Node, while `npm run dev`/`preview`/`dist` rebuild for Electron.
- README, `AGENTS.md`, and `docs/CONTRIBUTING.md` now describe the real branching model
  (`main` + feature PRs), guided scroll-capture MVP, server-side destinations, **115** unit
  tests (70 desktop + 45 backend), and honest integration gaps (OAuth/vault wiring).

## [0.6.0] — Unreleased — Production-grade backend
### Added
- **Postgres-capable store** (architecture §6): async `Db` port with SQLite (dev/test)
  and Postgres (prod) adapters, selected by `DATABASE_URL`. Verified against PostgreSQL 16.
- **Server-side Team search** (§5.6): `GET /v1/search` over the shared workspace library
  (filename + OCR text, spans team members), gated on a new `sharedLibrary` entitlement (Team).
- **Server-side delivery via the vault** (§5.2): `POST /v1/deliver` reveals the encrypted
  OAuth token server-side and delivers to Slack, Jira, Notion, Gmail, and GitHub. The token
  never reaches the client; the desktop sends only the image + target.
- **Real OAuth login** (§5.1): `GET /auth/oauth/:provider/{start,callback}` authorization-code
  flow with single-use CSRF state and Google/GitHub presets. New users start on Free.
  Dev `/auth/token` now gated behind `DEV_LOGIN`.
### Changed
- All backend stores and routes converted to async; `requireAuth` is async.
### Tests
- 26 backend tests (Postgres adapter smoke; Team search; mock-Slack delivery; OAuth with a
  mock provider). End-to-end HTTP smokes for search, delivery (vault bearer), and the OAuth
  start/callback round trip.

## [0.5.0] — Unreleased — Cloud sync
### Added
- **Cloud sync** (architecture §5.3/§6): metadata-first, last-write-wins, soft-delete
  tombstones, lazy image blobs.
  - Backend: `/v1/sync/push`, `/v1/sync/pull` (per-account monotonic seq cursor,
    workspace-scoped), `/v1/sync/blob/:id` (PUT/GET). Tier-gated on cloudSync (Free → 402).
  - Local store: sync columns (updated_at, deleted, dirty) + migration; soft-delete;
    reconcile methods (dirty/markClean/upsertRemote/missingImages/cursor).
  - Desktop SyncAgent: push dirty → upload blobs → pull → reconcile → lazy-fetch images.
    Runs 4s after launch and every 45s; manual "Sync now" button in the topbar (Pro/Team).
### Tests
- 6 desktop sync tests + 5 backend sync tests; two-device end-to-end round trip verified
  (push → pull → lazy blob → tier gate).

## [0.4.0] — Unreleased — Backend layer & live AI tagging
### Added
- **backend/** — Node + TypeScript modular monolith (architecture §5):
  - Auth: HMAC bearer tokens, requireAuth middleware, dev login (POST /auth/token).
  - Server-authoritative entitlements (GET /v1/entitlements).
  - Metered AI proxy (POST /v1/ai/tag): tier-gate (Free → 402), per-account
    rate limiting (Redis-ready), usage metering, forwards to the vision model
    (Anthropic when keyed, deterministic stub otherwise). API key stays server-side.
  - OAuth vault (PUT/GET/DELETE /v1/vault/:destination): AES-256-GCM at rest;
    GET returns metadata only — raw secrets never leave the server.
  - Billing webhook stub (POST /v1/billing/webhook) → tier update.
  - SQLite for dev behind a store layer; docker-compose for Postgres/Redis/MinIO (prod).
  - 12 backend unit tests (tokens, vault crypto, entitlements, rate limiting).
- Desktop pipeline now calls the AI proxy for auto-tagging when configured
  (SNAPFLOW_AI_PROXY_URL + SNAPFLOW_API_TOKEN), falling back to the local heuristic.
### Fixed
- Express async route errors now reach the error middleware via an asyncHandler wrapper.

## [0.3.0] — Unreleased — Multi-display & window picker
### Added
- Multi-display region capture: one freeze-frame overlay per monitor, each at its
  own resolution/scale factor; sessions keyed by webContents id; confirming on one
  display closes them all.
- Window picker: choose any open window or screen from a thumbnail grid and capture it.
- Global ⌘⇧5 shortcut opens the window picker from anywhere.
- Higher-resolution source capture (windows/screens captured up to the largest display's native resolution).
### Notes
- Cross-display drags are constrained to a single monitor (acceptable for v1).
- Native-accurate window capture (shadows, exact bounds) remains a native-sidecar task.

## [0.2.0] — Unreleased — Region capture
### Added
- Freeze-frame region-select overlay: instant frame grab, transparent always-on-top window,
  drag-to-select with live pixel dimensions, Esc to cancel, Enter to confirm.
- Device-pixel-accurate cropping (handles HiDPI scale factor).
- Global ⌘⇧4 shortcut to start a region capture from anywhere.
- `capture:added` event so captures finished in the overlay refresh the dashboard.
- Multi-entry preload + renderer build (dashboard window + overlay window).
### Notes
- Region capture currently targets the primary display; multi-display is the next follow-up.

## [0.1.0] — Unreleased — Foundation scaffold
### Added
- Local-first Electron + TypeScript + React architecture (main / preload / renderer).
- Core IP engine #1 — OCR/history: SQLite + FTS5 full-text search, workspace-scoped,
  delete-synced via triggers. Multi-tenant schema from day one.
- Core IP engine #2 — output-preset plugin system: `deliver(capture, config)` contract,
  runtime registry, clipboard destination fully working; Slack/Jira/Notion/email stubs.
- Capture engine behind a narrow swappable interface (Electron desktopCapturer).
- Contextualise pipeline: OCR → local PII detection (email/phone) → heuristic tagging → index.
- Tier & entitlement model (free/pro/team/perpetual) with client-side limit enforcement.
- AI proxy client (inert until backend exists; free tier never reaches a model).
- Data-driven dashboard wired to the real engine over a typed IPC bridge.
- Headless unit tests for the history engine, PII detection, and entitlements.
