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
[trigger: button / ⌘⇧4]
       ↓
  grabPrimaryFrame()         ← device-res screenshot, stays in memory
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
