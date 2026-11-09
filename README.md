# SnapFlow

[![CI](https://github.com/LukeHolmes/SnapFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/LukeHolmes/SnapFlow/actions/workflows/ci.yml)

**Capture → Context → Deliver.** A local-first, cross-platform screen-capture utility.
This repository is a real, runnable Electron desktop app plus a thin Node backend.
The codebase is on the **v0.6.1 unreleased** track (`package.json` and `CHANGELOG.md`
aligned); nothing is tagged for release yet.

It is built directly to the project's *Technical Architecture* and *Developer Instructions*.

---

## v1.0 MVP status (honest, code-checked)

Legend: **Done** ships in `main` and is usable locally with default/dev setup.
**Partial** works in code but needs config, polish, or a deliberate follow-up layer.
**Not started** has no meaningful implementation yet.

| Capability | Status | Notes |
|---|---|---|
| Region capture (freeze-frame overlay, ⌘⇧4) | **Done** | `src/main/region.ts`, multi-display overlays |
| Window / screen picker (⌘⇧5) | **Done** | `desktopCapturer` thumbnails in the dashboard modal |
| Scrolling capture | **Partial** | Guided scroll-stitch MVP: sample frames while the user scrolls, vertical stitch with overlap de-dupe (`src/main/capture/stitch.ts`, ⌘⇧6 UI). Preview before save; hides the dashboard during sampling. No native auto-scroll or sidecar yet. |
| Pinned captures | **Done** | Always-on-top floating reference window from post-capture quick actions or History (`src/main/pin.ts`). |
| Guide builder | **Done** | Walkthrough / SOP / training guides from ordered captures, Markdown export (`src/renderer/src/screens/Guides.tsx`). |
| Post-capture quick actions | **Done** | Copy, annotate, pin, OCR, redacted copy, and send preset from the bottom bar after each capture (`App.tsx`). |
| OCR + FTS5 history search | **Done** | Tesseract via `tesseract.js` (WASM); SQLite FTS5 in `src/main/history/` |
| Auto-tagging | **Done** | Metered `/v1/ai/tag` when configured; local heuristic fallback |
| Output presets (clipboard, Slack, Jira, Notion, Gmail, GitHub, Zapier) | **Done** (config required) | Desktop plugins call `POST /v1/deliver`; server handlers in `backend/src/deliver/destinations.ts`. OAuth connect/disconnect, vault storage, refresh, and `snapflow://` callbacks are wired. You still need provider apps + `backend/.env` (see `docs/DESTINATION_SETUP.md`). Clipboard stays fully local. |
| PII handling | **Partial** | On-device regex detect (email/phone) flags captures and feeds events; manual redacted copy + annotation redact/blur tools. Pipeline does **not** auto-burn pixels on detect. |
| Delay timer (2s / 5s) | **Done** | Full-screen delayed capture from the dashboard |
| Colour picker | **Partial** | Annotation stroke colour via `<input type="color">` in the editor (`AnnotationEditor.tsx`). No screen eyedropper / system colour sampler. |

Core architecture rules still hold: capture/OCR/history never import concrete integrations;
integrations only implement `deliver(capture, config)`; AI is tier-gated and proxy-metered.

---

## What else works on `main`

| Area | Status |
|---|---|
| **Electron app shell** (main / preload / renderer, typed IPC) | ✅ working |
| **Screen capture** via `desktopCapturer`, saved to disk | ✅ working |
| **Local PII detection** (email + phone) | ✅ working & unit-tested |
| **Backend** — auth, entitlements, metered AI proxy, OAuth vault, billing, sync | ✅ working (`backend/`) |
| **Cloud sync** — metadata-first, LWW, tombstones, lazy blobs (Pro/Team) | ✅ working |
| **Diff mode** — pixel diff + AI summary path | ✅ working & unit-tested |
| **Annotations** — editor, persistence, guide-oriented types | ✅ working & unit-tested |
| **Team server-side search** over the shared workspace library | ✅ backend implemented |
| Native capture sidecar, auto-scroll capture, Team admin/library UI polish | ⬜ next layers |

Headless unit tests: desktop `npm test`, backend `cd backend && npm test` (counts grow with each release — see CI output).

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

**Linux / cloud agents:** `npm run build` and `npm test` are the reliable paths. `npm run dev`
can still fail on Linux with `ERR_REQUIRE_ESM` when the main bundle `require()`s ESM-only
`pixelmatch` — see `AGENTS.md`.

Copy `.env.example` to `.env` to configure local desktop runs. Set the tier for local
testing with `SNAPFLOW_TIER=free npm run dev` (default `pro`).

For Slack/Jira/Notion/Gmail/GitHub delivery, configure the backend per `docs/DESTINATION_SETUP.md`.

---

## Project structure

```
src/
  shared/            Types + IPC channel names — the contract across all processes
  main/              Electron main process (the engine; never depends on the UI)
    capture/         Narrow capture interface (+ guided scroll-stitch MVP)
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

---

## Key design decisions (already baked in)

- **Multi-tenancy from day one.** Every capture, preset and event carries a `workspace_id`;
  search and reads are scoped to it.
- **Two core-IP engines are cleanly separable.** History/FTS and output presets do not
  depend on the UI or on each other.
- **Capture behind a narrow interface.** A native sidecar can replace capture without
  touching upstream stages.
- **AI is gated and metered.** Free tier never hits a model; keys stay on the backend proxy.
- **PII detection is fully local** — no screenshots are sent out to find PII.
- **Entitlements** express Free / Pro / Team / Perpetual (+ future on-prem).

---

## How region capture works

Triggering a region capture ( **New Capture** / **Region**, or **⌘⇧4** ) grabs a
full-resolution frame first, then opens a transparent overlay on that frozen frame. On
release the engine crops (CSS → device pixels), runs OCR → PII scan → tag → index, and
the dashboard refreshes via `capture:added`.

---

## Roadmap (remaining layers)

1. **Team product surface** — shared-library admin, membership/SSO, richer client UI.
3. **Scrolling capture v2** — native sidecar with auto-scroll and robust overlap detection.
4. **Screen recording** and deeper collaboration workflows.

The backend lives in `backend/` — see `backend/README.md`. See `CHANGELOG.md` for the
running log.
