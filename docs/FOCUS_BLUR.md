# Focus Blur (v1.1)

Focus Blur keeps one or more **focus regions** sharp and blurs (and optionally dims) everything else, so the important part of a screenshot stands out in docs, tickets, and chat.

## User workflow

1. After capture, use **Focus window** (inset rect) or **Focus region** (draw your own) from the post-capture quick bar, or open a capture from History and use the same tools when wired in-app.
2. In the editor: draw rectangles, move with **Move**, tune **Blur** / **Dim**, optionally **Invert** (blur inside instead).
3. **Save params** stores non-destructive settings on the capture (`capture_annotations.data_json` → `focusBlur`).
4. **Save blurred copy** writes a new PNG via the same canvas compose path used for live preview.

## Architecture

| Piece | Location |
|-------|----------|
| Params model + normalization | `src/focus-blur/model.ts` |
| Mask (rounded rect, invert) | `src/focus-blur/mask.ts` |
| Box blur + compose + PII overlay | `src/focus-blur/box-blur.ts`, `compose.ts` |
| Renderer preview/export | `src/focus-blur/canvas.ts` |
| Main PNG export (presets, deliver) | `src/main/capture/focus-blur-export.ts`, `delivery-image.ts` |
| UI | `src/renderer/src/components/FocusBlurEditor.tsx` |
| Preset hook (`focusBlurAuto` in preset `config`) | `src/focus-blur/preset.ts`, Output Presets screen |

Original capture bytes are never overwritten when you only save params; a new row is created when you save a blurred copy (same pattern as annotated/redacted copies).

## PII redaction

On **preset deliver**, the pipeline:

1. Applies Focus Blur (saved params and/or preset automation).
2. Re-scans OCR and burns **all** located PII boxes (same solid fill as manual redact).

Redactions always win over blur pixels so sensitive text cannot reappear inside a sharp region.

## Entitlements (client mirror)

| Tier | Focus regions | Preset auto Focus Blur on deliver |
|------|----------------|-------------------------------------|
| Free | 1 | No |
| Pro / Team / Perpetual | Unlimited | Yes |

Server-side billing gates still apply for paid destinations; see `src/main/entitlements/index.ts` and Account screen.

## Preset configuration

When saving any output preset, optional `config.focusBlurAuto`:

```json
{
  "enabled": true,
  "windowFocus": true,
  "blurRadius": 12,
  "dimAmount": 0.35,
  "invert": false
}
```

If `enabled` and the capture has no saved regions, `windowFocus` adds an inset rectangle (~12% margin). Otherwise saved `focusBlur` params on the capture are used.

## Testing

Headless tests in `tests/focus-blur.test.ts` cover mask math, compose, param persistence, preset merge, and entitlements.
