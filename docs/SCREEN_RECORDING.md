# Screen recording (v1.1)

SnapFlow screen recordings use **Electron `desktopCapturer` + `MediaRecorder`** (VP9/WebM). No bundled ffmpeg — encoding runs in a hidden renderer via the platform WebM stack.

## Capture modes

| Mode | Flow |
|------|------|
| **Full screen** | Primary display `desktopCapturer` source |
| **Window** | Same thumbnail picker as **⌘⇧5** capture (windows only): dashboard recording modal, tray **Record window…**, or after choosing Window in the modal |
| **Region** | Existing region overlay → crop rect applied in the worker via canvas `captureStream` |

## Controls

| Entry | Action |
|-------|--------|
| Dashboard **Record** card | Opens mode / countdown / audio options |
| Tray **Screen recording** | Full screen, 2s countdown |
| **⌘⇧8** (Ctrl+Shift+8) | Full screen, 2s countdown |
| Floating control | Pause / Resume / Stop (always on top) |
| Tray **Stop recording** | Stops active session |
| Red **SnapFlow is recording** badge | Privacy indicator (always on top, non-interactive) |

## Storage & history

- Files: `userData/recordings/*.webm`, thumbnail PNG under `captures/`.
- History row: `kind = recording`, tag **`recording`**, `duration_ms`, `byte_size`, `media_path`.
- **No cloud upload by default** — same local-first rule as screenshots. Deliver only via presets you explicitly trigger.

## Tier gates (desktop UX; server billing unchanged)

| Capability | Free | Pro / Team / Perpetual |
|------------|------|-------------------------|
| Max clip length | **5 min** | **60 min** (Team **120 min**) |
| Watermark | None | None |
| Microphone | Off | On |
| System audio | Off | On (OS-dependent; Windows loopback when Chromium allows) |
| GIF export | Off | On (≤15s, local `gifenc` in History) |

## Delivery

| Preset | Recording behaviour |
|--------|---------------------|
| **Clipboard** | Copies **file path** to the `.webm` |
| **Google Drive** (if configured) | Uploads `.webm` with `video/webm` when `mediaPath` is set |

## Architecture notes

- Core logic: `src/main/recording/*` (state machine, limits, persist, manager).
- Integrations unchanged at the interface boundary — recording rows are normal `Capture` objects with extra columns.
- Unit tests: `tests/recording.test.ts` (state machine, tier limits, history persistence).

## Real-device checklist (Luke)

- macOS: Screen Recording permission, mic permission, region + multi-monitor.
- Windows: system audio loopback, multi-monitor DPI.
- Verify VP9 availability; fallback to VP8 is automatic in the worker.
