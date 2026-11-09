# SnapFlow — Architecture Overview

> For the full technical specification, see the project's *Technical Architecture* document.
> This file is the living summary kept with the code.

## Principles

1. **Local-first, thin cloud** — capture, OCR, PII redaction and search all run on-device.
   The cloud exists only for sync, sharing, metered AI and billing.
2. **Modular, separable core IP** — the OCR/history engine and the output-preset engine are
   isolated behind narrow interfaces with no dependency on the UI shell.
3. **Server-authoritative entitlements** — local client checks are a UX convenience only;
   every paid capability is additionally gated server-side.
4. **Metered AI behind a proxy** — the vision-model API key never reaches the client.

## Process model

```
Main process (Node)           Renderer process (React)
──────────────────────        ────────────────────────
 capture/                      Dashboard UI
 ocr/                          Overlay UI (region selector)
 history/   ◄──IPC──►
 ai/                        Preload (contextBridge)
 entitlements/               ├── index.ts  (dashboard)
 integrations/               └── overlay.ts (selector)
 presets/
 events/
 pipeline.ts
 region.ts
```

## Data flow: Capture → Context → Deliver

```
[trigger: button / ⌘⇧4 / ⌘⇧5 / ⌘⇧6 / ⌘⇧7 / delay]
       ↓
  capture path (region / source / scroll-stitch / delayed full-screen)
       ↓
  grabPrimaryFrame()         ← device-res screenshot, stays in memory (region path)
       ↓
  region overlay              ← user selects rect (CSS px)
       ↓
  cropFrame(frame, rect)      ← converts to device px, writes PNG
       ↓
  HistoryStore.insert()       ← immediately searchable by filename
       ↓
  runOcr()                    ← Tesseract, background thread
       ↓
  detectPii()                 ← local regex (email / phone)
       ↓
  AI proxy tag or heuristicTag() ← backend when configured; offline fallback otherwise
       ↓
  HistoryStore.updateAnalysis() ← FTS5 index updated
       ↓
  EventLog.append()
       ↓
  webContents.send('capture:added')  ← dashboard refreshes
```

## Repository layout

```
src/
  shared/          types.ts, channels.ts   — shared contract
  main/
    capture/       Narrow capture interface (swappable for native sidecar)
    ocr/           Tesseract pipeline
    history/       SQLite + FTS5 store  ← core IP #1
    ai/            Local PII detection + metered AI proxy client
    entitlements/  Tier model (free / pro / team / perpetual)
    integrations/  deliver(capture, config) plugins  ← core IP #2
    presets/       Preset persistence
    events/        Activity feed log
    engine.ts      Shared context
    pipeline.ts    Contextualise stage
    region.ts      Freeze-frame overlay controller
    colour-picker.ts  Screen eyedropper overlay (local clipboard + colour history)
    ipc.ts         IPC channel registration
    index.ts       App bootstrap
  preload/
    index.ts       Dashboard contextBridge
    overlay.ts     Overlay contextBridge
  renderer/
    index.html     Dashboard entry
    overlay.html   Region-select overlay entry
    src/
      App.tsx, api.ts, styles.css, main.tsx, overlay.ts
tests/             Headless unit tests (no Electron dependency)
docs/              Architecture notes
```

## Screen colour picker (v1.0)

⌘⇧7 (dashboard **Colour**, tray **Pick colour**) freezes one frame per display (same
`grabAllFrames` path as region capture), opens a transparent overlay per monitor, and
samples pixels from the frozen bitmap in device pixels (HiDPI via `scaleFactor`). Click
copies the formatted value to the clipboard; picks are stored in local `picked_colors`
(no cloud sync). H/R/L switch format while picking; the dashboard **Copy as** control
persists the default format in `app_prefs`.

## Guided scrolling capture (MVP)

⌘⇧6 (and the dashboard **Scroll** card) runs a **guided** capture: the app samples the same
`desktopCapturer` source several times while the user scrolls, then stitches frames vertically
with simple overlap de-dupe (`src/main/capture/index.ts`). A native/browser sidecar can replace
this implementation later without changing IPC (`capture:scroll`, `capture:scrollPreview`).

## Server-side delivery

Desktop integrations (`src/main/integrations/*.ts`) send image bytes and preset config to
`POST /v1/deliver`. The backend picks the matching `ServerDestination` in
`backend/src/deliver/destinations.ts`, reveals the OAuth token from the vault server-side,
and talks to Slack/Jira/Notion/Gmail/GitHub APIs. The bearer token never reaches the client.

## Cloud sync (Pro/Team)

Metadata-first, last-write-wins, soft-delete tombstones, lazy image blobs. The
desktop agent pushes dirty rows (+ blobs), pulls changes since a per-account
monotonic `seq` cursor, and reconciles into the local SQLite via `upsertRemote`
(LWW on `updated_at`). Images are fetched only when a row has metadata but no
local file. Free/Perpetual tiers do not sync (gated server-side).

## Multi-tenancy

Every row carries `workspace_id`. Reads are scoped at the query layer.
The Team shared library slots in with no migration.

## Key decisions (see §11 of full arch doc)

| Decision | Resolved to |
|---|---|
| PII detection | Fully local regex — no screenshots sent out to find PII |
| Perpetual tier | Authenticated, AI-enabled, non-recurring entitlement state |
| Desktop framework | Electron; capture behind narrow interface keeps Tauri reversible |
