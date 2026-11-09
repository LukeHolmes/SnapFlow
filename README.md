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
| PII handling | **Partial** | On-device detect for email, phone, names (dictionary/heuristic), Luhn cards, IBAN, and IPv4; OCR word boxes drive a toggleable redact modal before pixel blur. Pipeline flags hits but does **not** auto-burn pixels on capture. |
| Delay timer (2s / 5s) | **Done** | Full-screen delayed capture from the dashboard |
| Colour picker (⌘⇧7) | **Done** | Screen eyedropper with magnified loupe, HEX/RGB/HSL clipboard formats, recent-colour history (`src/main/colour-picker.ts`). Annotation editor still has a local stroke colour input. |

Core architecture rules still hold: capture/OCR/history never import concrete integrations;
integrations only implement `deliver(capture, config)`; AI is tier-gated and proxy-metered.

---

## What else works on `main`

| Area | Status |
|---|---|
| **Electron app shell** (main / preload / renderer, typed IPC) | ✅ working |
| **Screen capture** via `desktopCapturer`, saved to disk | ✅ working |
| **Local PII detection** (email, phone, names, card/IBAN/IP) | ✅ working & unit-tested |
| **Backend** — auth, entitlements, metered AI proxy, OAuth vault, billing, sync | ✅ working (`backend/`) |
| **Cloud sync** — metadata-first, LWW, tombstones, lazy blobs (Pro/Team) | ✅ working |
| **Diff mode (v1.1)** — pixel diff, multi-view UI, History export & Deliver; AI summary Pro+ | ✅ working & unit-tested |
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

**Windows (installer from CI):** There is no signed release on GitHub Releases yet. To try
SnapFlow on Windows, download the unsigned NSIS installer from a green CI run:

1. Open [Actions → CI](https://github.com/LukeHolmes/SnapFlow/actions/workflows/ci.yml).
2. Pick a run whose **Windows (NSIS installer)** job succeeded (on `main`, a PR into `main`,
   or **Run workflow** via `workflow_dispatch`).
3. At the bottom of the run summary, under **Artifacts**, download **`snapflow-windows-installer`**
   (a `.zip` containing `SnapFlow Setup <version>.exe`).
4. Extract the `.exe` and run the installer. Windows SmartScreen may warn because the build is
   **not code-signed** — choose *More info* → *Run anyway* for local testing only.
5. After install, launch **SnapFlow** from the Start menu. Grant **screen capture** permission
   when Windows prompts. Optional: copy `.env.example` to `%APPDATA%\SnapFlow\.env` if you add
   per-user config later (defaults work for a local-only try).

To rebuild the installer yourself: `npm run dist -- --publish never` on Windows (requires
Electron’s native toolchain; CI uses `windows-latest`).

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
