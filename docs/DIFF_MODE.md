# Diff mode (v1.1)

SnapFlow compares two on-disk captures with **pixelmatch** (`src/main/diff/`). The desktop renderer drives selection, view modes, export, and delivery; capture itself stays independent of integrations.

## Workflow

1. Open **Diff Mode** or use **History → compare** on a capture.
2. Choose **Before** and **After** (or **Previous same window** on the After slot).
3. **Compare** runs in the main process; results include change %, optional region boxes, and a diff PNG under `userData/diffs/`.
4. **Save diff to History** copies the artefact into `captures/` with the `diff` content tag (OCR runs; tag is preserved).
5. Deliver via **Clipboard** or any configured **preset** (same path as other captures).

## Tiers (client UX; AI also gated server-side)

| Capability | Free | Pro / Team / Perpetual |
|---|---|---|
| Pixel diff, side-by-side, overlay, highlights | ✅ | ✅ |
| Sensitivity threshold | — | ✅ |
| Changed-region bounding boxes | — | ✅ |
| AI plain-English summary | — | ✅ (`diff:summarise` / `POST /v1/ai/diff`) |

Entitlement field: `diffAdvanced` in `src/main/entitlements/index.ts`.

## IPC

| Channel | Purpose |
|---|---|
| `diff:compute` | `{ beforeId, afterId, options? }` → stats + `diffImagePath` + `regions` |
| `diff:getImage` | Local diff path → data URL |
| `diff:save` | Persist diff into History |
| `diff:findPrevious` | Match prior capture by normalised filename |
| `diff:summarise` | AI summary (entitled tiers only) |
