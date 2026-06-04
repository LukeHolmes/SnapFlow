# Contributing to SnapFlow

## Prerequisites

- Node.js 20+
- macOS or Windows (screen-recording permission required on macOS)

## Setup

```bash
git clone https://github.com/<org>/snapflow.git
cd snapflow
npm install        # also rebuilds better-sqlite3 for your Electron version
npm run dev        # launches the app with hot reload
```

If the native module rebuild fails:
```bash
npm run rebuild    # runs electron-rebuild manually
```

## Environment

Copy `.env.example` to `.env` and set `SNAPFLOW_TIER` for local testing:
```
SNAPFLOW_TIER=free   # tests the free-tier limits
SNAPFLOW_TIER=pro    # default
```

## Testing

```bash
npm test           # headless unit tests (no Electron required)
npm run typecheck  # tsc --noEmit
```

Tests live in `tests/` and cover the history engine, PII detection, and entitlements.
They import only `better-sqlite3` and the shared types, so they run without Electron.

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
