# SnapFlow

**Capture → Context → Deliver.** A local-first, cross-platform screen-capture utility.
This repository is the **foundation scaffold (v0.1)** — a real, runnable Electron application
with the two core-IP engines working and a clean structure to build the rest of the roadmap on.

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
| **Heuristic auto-tagging** (offline; AI proxy comes later) | ✅ working |
| **Output presets** — plugin contract + **clipboard** destination | ✅ working |
| Slack / Jira / Notion / Email destinations | 🟡 contract implemented, credentials/OAuth pending |
| **Backend** — auth, entitlements, metered AI proxy, OAuth vault, billing | ✅ working (in `backend/`) |
| **Live AI auto-tagging** via the proxy (heuristic fallback) | ✅ wired |
| **Cloud sync** — metadata-first, LWW, tombstones, lazy blobs (Pro/Team) | ✅ working |
| **Tier & entitlement model** (free/pro/team/perpetual) | ✅ working & unit-tested |
| **Dashboard UI** wired to the live engine | ✅ working |
| AI proxy backend, cloud sync, Team library, Diff mode | ⬜ next layers (structure is ready) |

13 headless unit tests cover the history engine, PII detection, and entitlements (`npm test`).

---

## Running it

```bash
npm install        # installs deps; postinstall rebuilds better-sqlite3 for Electron
npm run dev        # launches the desktop app with hot reload
```

If the native module needs a manual rebuild for your Electron version:
```bash
npm run rebuild
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

Set the tier for local testing: `SNAPFLOW_TIER=free npm run dev` (default `pro`).

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
- **AI is gated and metered.** The free tier never reaches a model; all model access is meant
  to flow through the backend proxy (the API key never touches the client). Offline heuristic
  tagging stands in until that backend exists.
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
   Remaining backend work: Postgres migration of the stores, real OAuth login flow,
   server-side Team search index.
4. **Finish the destination integrations** end-to-end (server-side delivery using the vault).
5. **Scrolling capture & window-shadow accuracy** via the native capture sidecar.
6. **v1.1**: Diff mode, screen recording, Team shared library + admin/SSO.

The backend lives in `backend/` — see `backend/README.md` to run it.

See `CHANGELOG.md` for the running log.
