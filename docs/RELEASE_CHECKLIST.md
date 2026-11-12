# Release checklist (proprietary / release readiness)

Companion to on-device sign-off in `docs/RELEASE_CHECKLIST_1.1.md`.

> **Feature freeze:** Treat **v1.1 as frozen** until the privacy/security pass items (opt-in AI, delivery redaction, in-app sign-in, offline OCR, share-link TTL, secret separation, sandbox/permissions hardening, and Linux pixelmatch/AppImage smoke) are merged and verified on `main`. Do not tag a public v1.1 release before that.

## Done in codebase (verify on PR)

- [ ] **Auto-update wiring** — GitHub Releases provider config; startup + menu check; dev disabled; unit tests (`tests/update.test.ts`); notes in `docs/AUTO_UPDATE.md`.
- [ ] **Cross-platform packaging config** — `electron-builder` targets: Windows NSIS (existing CI), macOS DMG (unsigned), Linux AppImage + deb; `better-sqlite3` asar unpack; Linux chrome-sandbox fallback.
- [ ] **Manual packaging workflow** — `.github/workflows/package-unix.yml` (`workflow_dispatch` only; **not** on push/PR).
- [ ] **Draft legal docs** — `docs/PRIVACY.md`, `docs/EULA.md` (marked DRAFT).
- [ ] **Third-party notices** — `npm run licenses:bundle` → `resources/third-party-licenses.txt`, bundled in installer; shown on **About** screen.
- [ ] **About screen** — version, copyright line, licence notices, links to open draft privacy/EULA/proprietary LICENSE.
- [ ] **Proprietary LICENSE** — root `LICENSE` (Copyright © 2026 Luke Holmes); `package.json` `license` remains `UNLICENSED`; bundled in installers via `extraResources`.

## Still needs Luke (blockers for paid/public release)
- [ ] **Production backend hosting** — URL, data retention, DPA, support contact for cloud sync/AI/delivery.
- [ ] **Code signing** — Apple Developer ID + notarization; Windows Authenticode for NSIS; document for Linux package repos if applicable.
- [ ] **Device QA** — Windows and macOS hardware passes from `docs/RELEASE_CHECKLIST_1.1.md`.
- [ ] **Legal review** — finalize Privacy Policy and EULA drafts with counsel; replace DRAFT banners.
- [ ] **First signed GitHub Release** — upload artefacts and smoke-test auto-update on each platform.

## Local verification commands

```bash
npm run typecheck && npm test && npm run build
xvfb-run -a env ELECTRON_SMOKE_XVFB=1 ELECTRON_SMOKE_NO_CHROME_SANDBOX=1 node --test --import tsx tests/electron-smoke.test.ts
npm run licenses:bundle
npm run dist -- --linux AppImage --publish never
xvfb-run -a node scripts/linux-appimage-smoke.cjs dist/*.AppImage
```
