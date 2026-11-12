# SnapFlow Privacy Policy (DRAFT)

> **Status:** DRAFT for Luke Holmes review — not legal advice. Do not ship as final copy without counsel.

## Summary

SnapFlow is **local-first**. Screenshots, recordings, OCR text, and history metadata stay on your device unless you explicitly enable cloud sync, cloud AI tagging, delivery integrations, or share links.

## Data flow (what goes where)

| Data | Default (local only) | Cloud AI auto-tagging (opt-in, Account) | Destinations (Slack, Notion, …) | Cloud sync (opt-in) | Public share links |
| --- | --- | --- | --- | --- | --- |
| Capture PNG | Stays on disk | Sent to **your** configured AI proxy when enabled; **skipped** if PII is detected in OCR | Processed/redacted delivery image + metadata (tag, timestamp, PII label — **no raw OCR body**) | Metadata always when enabled; blobs on deliver / manual sync | HMAC-signed URL to blob (default **24h** TTL, env `SIGNED_URL_TTL_MS`) |
| OCR text | SQLite on device | Used locally for PII gate; not sent in destination posts | Not included in integration comments | May sync as metadata | Not exposed in link |
| OCR / PII boxes | On-device Tesseract (bundled `eng.traineddata`, no language download) | PII → no cloud tag | Pixel redaction when delivering when possible | — | — |
| Account token | OS **safeStorage** when available | Same | Same | Same | — |
| OAuth destination tokens | Backend vault (when configured) | — | Used server-side only | — | — |

## Data stored locally

On your computer, SnapFlow may store:

- Capture images and recordings (files on disk)
- SQLite history (filenames, OCR text, tags, annotations metadata)
- API bearer token (encrypted with Electron safeStorage when available)
- App preferences (cloud sync opt-in, **AI tagging opt-in**, colour picker format, presets)

This data is not sent to SnapFlow servers by default.

## Optional cloud backend

When you **sign in** (Google/GitHub OAuth via your configured backend) or, in **development builds only**, set `SNAPFLOW_API_TOKEN` in `.env`:

- **Entitlements** — your account tier is fetched periodically.
- **Cloud sync (Pro/Team, opt-in)** — capture metadata and optionally image blobs sync to the backend you configure.
- **AI auto-tagging (opt-in)** — capture PNGs are sent to the configured AI proxy for tagging when enabled; blocked when PII is detected until you redact.
- **Delivery integrations** — when you send a capture, the app uses your connected accounts via the backend with processed images and non-sensitive metadata.

We do not intend to store your capture content on SnapFlow-operated servers unless you use a SnapFlow-hosted backend and enable sync/delivery. **Production hosting policy is not yet finalized** (see `docs/RELEASE_CHECKLIST.md`).

## What we do not collect in the desktop app alone

- No analytics SDK is bundled in the open-source tree at time of writing.
- No passwords for third-party sites are stored in the desktop app (OAuth tokens only).

## Secrets

Never commit API tokens or `.env` files. Production backends require distinct `AUTH_SECRET`, `SHARE_LINK_SECRET`, and `VAULT_KEY` (see `backend/.env.example`).

## Auto-updates

Packaged builds may check **GitHub Releases** for newer versions. That check contacts GitHub, not a SnapFlow-specific tracker. See `docs/AUTO_UPDATE.md`.

## Contact

**TBD** — Luke to add support contact before public release.

## Changes

This draft will be versioned when the company entity and support contact are finalized. SnapFlow is proprietary software (see repository `LICENSE`).
