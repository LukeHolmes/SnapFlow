# Contributing to SnapFlow

## Prerequisites

- Node.js 20+
- macOS or Windows (screen-recording permission required on macOS)

## Setup

```bash
git clone https://github.com/<org>/snapflow.git
cd snapflow
npm install
cp .env.example .env
npm run dev        # launches the app with hot reload
```

`better-sqlite3` is native and must be rebuilt for the runtime that loads it.
The npm scripts handle the common flows:

```bash
npm test                 # pretest rebuilds for Node
npm run dev              # predev rebuilds for Electron
npm run rebuild:node     # manual Node/test rebuild
npm run rebuild:electron # manual Electron/runtime rebuild
```

## Environment

Copy `.env.example` to `.env` and set `SNAPFLOW_TIER` for local testing:
```
SNAPFLOW_TIER=free   # tests the free-tier limits
SNAPFLOW_TIER=pro    # default
```

For backend development:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

## Testing

```bash
npm test           # headless unit tests (no Electron required)
npm run typecheck  # tsc --noEmit

cd backend
npm test
npm run typecheck
```

Tests live in `tests/` and `backend/tests/`. They cover the desktop history engine,
PII detection, entitlements, pipeline, sync and diff logic, plus backend auth, vault,
AI, delivery, OAuth, sync and entitlement behavior.

## Branching strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code only |
| `develop` | Integration branch — all features merge here first |
| `feature/<name>` | Feature branches off `develop` |
| `release/<version>` | Stabilisation; bug fixes only |

## Adding a new output destination

1. Create `src/main/integrations/<name>.ts`.
2. Implement the `OutputDestination` interface (`id`, `label`, `requiresAuth`, `deliver`).
3. Register it in `src/main/integrations/registry.ts`.
4. No changes to the capture, OCR or history modules are needed or expected.

## Performance targets (fail CI if exceeded)

| Operation | Target |
|---|---|
| Capture to clipboard | < 300 ms |
| OCR (background) | < 5 s for images ≤ 2560 px wide |
| History search | < 200 ms over 10,000 captures |
