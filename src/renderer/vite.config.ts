import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Vite build for Vercel / browser preview (`npm run web:build`).
// Electron production builds use electron.vite.config.ts instead.
// GitHub Pages serves project sites at /{repo}/ — set VITE_BASE=/SnapFlow/ for that build.
//
// A plain browser has no preload bridge, so mock data is the only data source for
// this build. Enable it by default; set VITE_ALLOW_WEB_MOCK=false to opt out.
const allowWebMock = process.env.VITE_ALLOW_WEB_MOCK ?? 'true';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: {
    'import.meta.env.VITE_ALLOW_WEB_MOCK': JSON.stringify(allowWebMock),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
