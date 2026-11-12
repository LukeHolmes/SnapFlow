# Auto-update (electron-updater)

SnapFlow uses [electron-updater](https://www.electron.build/auto-update) with the **GitHub Releases** provider.

## Configuration

- Provider: `github`, owner `LukeHolmes`, repo `SnapFlow` (see root `package.json` → `build.publish`).
- **Development** (`npm run dev`, unpackaged): update checks are **disabled**.
- **Packaged** app: checks run ~8 seconds after startup and from **Help → Check for Updates…** (macOS: app menu).
- Downloads are automatic; install is **user-prompted** (“Restart now” / “Later”). `autoInstallOnAppQuit` is off.

## CI / publishing

- CI and local `npm run dist` use **`--publish never`**. No release is created in automation on push/PR.
- Creating a GitHub Release with attached platform assets is a **manual** step after signing/hosting decisions.

## Unsigned builds (important)

| Platform | Limitation |
|----------|------------|
| **Windows** | NSIS auto-update generally expects a **code-signed** installer. Unsigned Windows builds may fail to apply updates or trigger SmartScreen warnings. |
| **macOS** | Updates require **Apple code signing and notarization** for a smooth Gatekeeper experience; unsigned DMGs are for testing only. |
| **Linux** | AppImage/deb updates can work without vendor signing, but users must trust the update feed (GitHub Releases). |

Document this for beta testers until signing certificates are in place.

## Linux sandbox

Packaged Linux builds unpack `better-sqlite3` and rely on Chromium’s setuid `chrome-sandbox` when present. If the sandbox helper is missing (common in some AppImage environments), SnapFlow falls back to `--no-sandbox` for the Chromium embedder only. See `src/main/update/install.ts` (`configureLinuxChromeSandbox`).
