# SnapFlow Privacy Policy (DRAFT)

> **Status:** DRAFT for Luke Holmes review — not legal advice. Do not ship as final copy without counsel.

## Summary

SnapFlow is **local-first**. Screenshots, recordings, OCR text, and history metadata stay on your device unless you explicitly enable cloud sync or connect optional online services.

## Data stored locally

On your computer, SnapFlow may store:

- Capture images and recordings (files on disk)
- SQLite history (filenames, OCR text, tags, annotations metadata)
- Integration OAuth tokens (encrypted when a backend vault is configured)
- App preferences (sync opt-in, colour picker format, presets)

This data is not sent to SnapFlow servers by default.

## Optional cloud backend

If you configure `SNAPFLOW_API_TOKEN` and a SnapFlow cloud/proxy URL:

- **Entitlements** — your account tier is fetched periodically.
- **Cloud sync (Pro/Team)** — capture **metadata** and optionally **encrypted blobs** sync to the backend you configure.
- **AI features** — when enabled, image snippets or OCR may be sent to the configured AI proxy for tagging or summaries (per your plan).
- **Delivery integrations** — when you send a capture to Slack, Jira, etc., the app uses your connected accounts via the backend.

We do not intend to store your capture content on SnapFlow-operated servers unless you use a SnapFlow-hosted backend and enable sync/delivery. **Production hosting policy is not yet finalized** (see `docs/RELEASE_CHECKLIST.md`).

## What we do not collect in the desktop app alone

- No analytics SDK is bundled in the open-source tree at time of writing.
- No passwords for third-party sites are stored in the desktop app (OAuth tokens only).

## Secrets

Never commit API tokens or `.env` files. Tokens belong in environment variables or OS keychain flows provided by your deployment.

## Auto-updates

Packaged builds may check **GitHub Releases** for newer versions. That check contacts GitHub, not a SnapFlow-specific tracker. See `docs/AUTO_UPDATE.md`.

## Contact

**TBD** — Luke to add support contact before public release.

## Changes

This draft will be versioned when the company entity and support contact are finalized. SnapFlow is proprietary software (see repository `LICENSE`).
