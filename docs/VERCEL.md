# SnapFlow web preview on Vercel

The React dashboard runs in the browser with **mock data** (no Electron, capture, or SQLite). Use it to review UI and flows before installing the desktop app.

## Deploy from Git

1. [Import the repo](https://vercel.com/new) in Vercel (or open an existing SnapFlow project).
2. Use branch **`main`**.
3. Vercel reads **`vercel.json`** at the repo root:
   - **Build:** `npm run web:build`
   - **Output:** `src/renderer/dist`
4. Deploy. No backend or env vars are required for the static preview; the web build enables the mock API by default.
5. After building, run `npm run web:check` to confirm the bundle can render without Electron.

## Local preview

```bash
npm install
npm run web:dev      # http://localhost:5173
npm run web:build
npm run web:check
npm run web:preview
```

## CLI deploy

```bash
npx vercel link
npx vercel deploy --prod   # or omit --prod for a preview URL
```

Requires a Vercel account (`vercel login` or `VERCEL_TOKEN`).
