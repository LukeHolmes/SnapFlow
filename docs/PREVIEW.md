# Viewing SnapFlow without installing anything

The dashboard UI can run in a **browser** with mock data (no Electron, no `npm install` on your machine).

## GitHub Pages (recommended if Vercel is blocked)

After enabling Pages (see below), the live preview is:

**https://lukeholmes.github.io/SnapFlow/**

Built automatically on every push to `main` via `.github/workflows/web-preview-pages.yml`.

### One-time repo setup (GitHub website)

1. Open **https://github.com/LukeHolmes/SnapFlow/settings/pages**
2. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from branch”).
3. Merge the workflow that adds `web-preview-pages.yml` (if not already on `main`).
4. Open **Actions** → **Web preview (GitHub Pages)** → confirm the latest run is green.
5. Visit the URL above (allow a minute after the first deploy).

No environment variables or secrets are required.

## Vercel (optional)

See `docs/VERCEL.md`. Uses the same `npm run web:build` output; optional if Pages works better on your network.

## What you’re *not* getting in the browser preview

- Real screen capture, OCR, or SQLite (those need the **desktop app** on a machine where installs are allowed).
- Backend API unless you host `backend/` separately and configure env vars.

The preview is for **UI and flow review** with sample data.

## If your work laptop blocks everything except GitHub

- Use the **Pages URL** in the browser, or  
- On GitHub: **Actions** tab → open the latest green workflow → copy the deployment URL from the job summary, or  
- Ask someone to attach a **screen recording** to a release/PR.
