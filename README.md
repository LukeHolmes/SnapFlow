# SnapFlow

**Capture → Context → Deliver.** A local-first, cross-platform screen-capture utility.
This repository is a real, runnable Electron desktop app plus a thin Node backend.
The codebase is currently in the **v0.6 unreleased** track: the desktop foundation,
backend, cloud sync, server-side delivery path, Team search, and Diff mode are all
present, with several integrations still intentionally stubbed.

It is built directly to the project's *Technical Architecture* and *Developer Instructions*.

---

## What actually works right now

| Area | Status |
|---|---|
| **Electron app shell** (main / preload / renderer, typed IPC) | ✅ working |
| **Screen capture** via `desktopCapturer`, saved to disk | ✅ working |
| **Region select** — freeze-frame overlay, drag-to-crop, ⌘⇧4 global shortcut | ✅ working |
| **Multi-display** region capture (per-monitor overlays) | ✅ working |
| **Window picker** — pick any window/screen, ⌘⇧5 | ✅ working |
| **OCR** (Tesseract, on-device, background) | ✅ working |
| **History engine** — SQLite + **FTS5** full-text search, workspace-scoped | ✅ working & unit-tested |
| **Local PII detection** (email + phone) | ✅ working & unit-tested |
| **Heuristic auto-tagging** (offline fallback) | ✅ working |
| **Output presets** — plugin contract + **clipboard** destination | ✅ working |
| Slack / Jira / Notion / Email destinations | 🟡 contract implemented, credentials/OAuth pending |
| **Backend** — auth, entitlements, metered AI proxy, OAuth vault, billing | ✅ working (in `backend/`) |
| **Live AI auto-tagging** via the proxy (heuristic fallback) | ✅ wired |
| **Cloud sync** — metadata-first, LWW, tombstones, lazy blobs (Pro/Team) | ✅ working |
| **Tier & entitlement model** (free/pro/team/perpetual) | ✅ working & unit-tested |
| **Dashboard UI** wired to the live engine | ✅ working |
| **Diff mode** — pixel diff + AI summary path | ✅ working & unit-tested |
| **Team server-side search** over the shared workspace library | ✅ backend implemented |
| Native sidecar, scrolling capture, Team admin/library UI | ⬜ next layers |

59 headless unit tests cover the desktop history/PII/entitlements/pipeline/sync/diff
logic and backend auth/vault/AI/sync/delivery/OAuth modules.

---

## Running it

```bash
npm install        # installs deps
npm run dev        # launches the desktop app with hot reload
```

`better-sqlite3` is a native dependency. The scripts rebuild it for the runtime that
needs it:

```bash
npm test                 # pretest rebuilds better-sqlite3 for Node
npm run dev              # predev rebuilds better-sqlite3 for Electron
npm run rebuild:node     # manual Node/test rebuild
npm run rebuild:electron # manual Electron/runtime rebuild
```

Other scripts:
```bash
npm test           # headless unit tests (no Electron needed)
npm run typecheck  # tsc --noEmit
npm run build      # production bundle
npm run dist       # package installers (electron-builder)
```

**macOS:** first capture will prompt for Screen Recording permission
(System Settings → Privacy & Security → Screen Recording).

Copy `.env.example` to `.env` to configure local desktop runs. Set the tier for local
testing with `SNAPFLOW_TIER=free npm run dev` (default `pro`).

---

## Project structure

```
src/
  shared/            Types + IPC channel names — the contract across all processes
  main/              Electron main process (the engine; never depends on the UI)
    capture/         Narrow capture interface (swappable for a native sidecar later)
    ocr/             Tesseract pipeline
    history/         SQLite + FTS5 store and schema  ← core IP #1
    ai/              Local PII detection + metered AI proxy client
    entitlements/    Tier model & limit checks
    integrations/    deliver(capture, config) plugins  ← core IP #2
    presets/         Preset persistence
    events/          Activity feed log
    pipeline.ts      Contextualise stage: OCR → PII → tag → index
    ipc.ts           Wires the engines to IPC channels
    index.ts         App bootstrap
  preload/           contextBridge — the only main↔renderer door
  renderer/          React dashboard (the UI shell)
tests/               Headless unit tests
```

This maps onto the architecture's repository layout (capture / ocr / ai / history /
integrations), adapted for Electron's main-vs-renderer split.

---

## Key design decisions (already baked in)

These are the things the architecture says are *painful to change later*, so they are correct from v0.1:

- **Multi-tenancy from day one.** Every capture, preset and event carries a `workspace_id`;
  search and reads are scoped to it. The Team shared library slots in with no migration.
- **Two core-IP engines are cleanly separable.** The history/FTS engine and the output-preset
  plugin system have no dependency on the UI shell or on each other.
- **Capture behind a narrow interface.** `captureSource` / `captureRegion` only — a native
  capture sidecar can replace this without touching anything upstream.
- **AI is gated and metered.** The free tier never reaches a model; all model access flows
  through the backend proxy when configured (the API key never touches the client). Offline
  heuristic tagging is the fallback.
- **PII detection is fully local** (resolves the §11 contradiction — no screenshots sent out to find PII).
- **Entitlements** express recurring (Pro/Team), non-recurring (Perpetual) and future on-prem states.

---

## How region capture works

Triggering a region capture (the **New Capture** / **Region** buttons, or **⌘⇧4** anywhere)
grabs a full-resolution frame of the screen *first*, then opens a transparent overlay window
showing that frozen frame dimmed. You drag a bright selection rectangle; on release the engine
crops the frozen frame (converting CSS pixels → device pixels via the display's scale factor),
runs it through the OCR → PII → tag → index pipeline, and the dashboard refreshes via a
`capture:added` event. No screen flash, and the overlay never appears in the shot.

The overlay is a separate `BrowserWindow` with its own minimal preload — it reports only a
rectangle back to the engine and never touches the stores directly.

## The next layers to build (in order)

1. ✅ ~~Region-select overlay~~ — done (freeze-frame overlay, multi-display is the one follow-up).
2. ✅ ~~Window picker + multi-display region support~~ — done.
3. ✅ ~~Backend (auth, entitlements, metered AI proxy, OAuth vault, billing)~~ — done (`backend/`).
   ✅ ~~Cloud sync service~~ — done (metadata + blobs, tier-gated).
   ✅ ~~Postgres-capable store, real OAuth login, and server-side Team search~~ — done.
4. ✅ ~~Diff mode~~ — done (pixel diff, UI, backend AI summary path).
5. **Finish the destination integrations** end-to-end (Slack is live server-side;
   Jira/Notion/email remain stubbed behind the same contract).
6. **Team shared-library product surface** — admin, membership/SSO, and richer client UI.
7. **Scrolling capture & window-shadow accuracy** via the native capture sidecar.
8. **Screen recording** and deeper collaboration workflows.

The backend lives in `backend/` — see `backend/README.md` to run it.

See `CHANGELOG.md` for the running log.
