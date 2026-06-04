# AGENTS.md

## Cursor Cloud specific instructions

SnapFlow is two sibling **npm** projects (not a workspace monorepo): the **Electron desktop app** at the repo root and the **Express backend** in `backend/`. See `README.md` and `docs/CONTRIBUTING.md` for the canonical setup flow.

### Prerequisites

- **Node.js 20+** (Node 22 in this environment is fine).
- **npm** only (`package-lock.json` at root and in `backend/`).
- **Linux cloud VMs:** a display (`DISPLAY`) exists for GUI work, but full screen-capture E2E still needs macOS/Windows permissions; treat headless verification as tests + backend API.

### Dependency refresh (automatic on VM startup)

From repo root:

```bash
npm install
cd backend && npm install
```

Copy env templates once per machine (not in the update script): `cp .env.example .env` and `cp backend/.env.example backend/.env`.

### Services

| Service | Port | Start | Notes |
|---------|------|-------|-------|
| Backend API | 3001 | `cd backend && npm run dev` | Default SQLite (`DB_PATH`); `DEV_LOGIN=true` enables `POST /auth/token`. |
| Electron dev | 5173 (renderer) | `npm run dev` from root | `predev` rebuilds `better-sqlite3` for Electron. |
| Docker (optional) | 5432 / 6379 / 9000 | `cd backend && docker compose up -d` | Postgres/Redis/MinIO only needed for `DATABASE_URL` or future infra; not required for default dev. |

Use **tmux** for long-running `npm run dev` processes in Cloud Agent VMs.

### Verification commands (no ESLint in repo)

| Package | Typecheck | Tests | Build / run |
|---------|-----------|-------|-------------|
| Root (desktop) | `npm run typecheck` | `npm test` (29 tests; `pretest` runs `rebuild:node`) | `npm run build`; `npm run dev` for GUI |
| Backend | `cd backend && npm run typecheck` | `cd backend && npm test` (30 tests) | `cd backend && npm run dev` |

There is **no** configured `lint` script.

### Backend smoke test (core cloud path)

With the backend running on port 3001:

```bash
curl -s http://localhost:3001/health
curl -s -X POST http://localhost:3001/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","tier":"pro"}'
# Use returned token:
curl -s -X POST http://localhost:3001/v1/ai/tag \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"imageBase64":"<base64 png>"}'
```

Wire the desktop app via `.env`: `SNAPFLOW_AI_PROXY_URL=http://localhost:3001` and `SNAPFLOW_API_TOKEN=<token>`.

### `better-sqlite3` native rebuilds

- **Node tests:** `npm run rebuild:node` (also run automatically by `pretest`).
- **Electron dev/build:** `npm run rebuild:electron` (also run by `predev` / `prepreview` / `predist`).

If native module errors appear after switching Node/Electron versions, rerun the matching rebuild script.

### Electron dev on Linux (known issue)

As of this tree, `npm run dev` can fail at Electron startup with `ERR_REQUIRE_ESM` when the main bundle `require()`s `pixelmatch` (ESM-only). **`npm run build` succeeds** and **headless `npm test` passes**; use backend API smoke tests for cloud verification until that import is fixed. Do not assume `npm run dev` works in CI/cloud without checking this error.

### Non-obvious gotchas

- **Two separate `npm install`:** root and `backend/` each have their own `node_modules`.
- **Backend rate limiting** is in-memory (`backend/src/rate-limit.ts`); Redis in compose is not wired yet.
- **Blob storage** uses `DATA_DIR/blobs` on disk, not MinIO, unless you change implementation later.
