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

## Continuous integration

GitHub Actions workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on
every pull request and on pushes to `main`. It installs the root Electron app and the
sibling `backend/` package (separate `npm ci` + lockfile caches), then runs `npm run
typecheck` and `npm test` in each. Root tests use `pretest` to rebuild `better-sqlite3`
for Node; the backend job runs `npm rebuild better-sqlite3` after install. Hosted
`ubuntu-latest` runners only — no matrix of OS images.

The [Web preview (GitHub Pages)](../.github/workflows/web-preview-pages.yml) workflow is
unchanged and still deploys the browser UI preview from `main`.

## Branching strategy

SnapFlow uses **trunk-based development on `main`**. There is no long-lived `develop`
branch.

| Branch | Purpose |
|---|---|
| `main` | Default branch; always deployable/releasable integration point |
| `feature/<name>` | Short-lived docs or product branches (e.g. `feature/docs-truth-up`) |
| `cursor/<task>-<id>` | Cloud agent branches — open a PR into `main` when ready |
| `fix/<topic>` | Focused fixes (e.g. dependency bumps) |
| `dependabot/...` | Automated dependency PRs |

Flow: branch off `main` → PR into `main` → delete the branch after merge when convenient.
Release tags (when we start tagging) will point at `main` at the chosen commit.

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
