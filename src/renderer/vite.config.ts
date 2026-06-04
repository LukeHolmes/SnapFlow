import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Vite build for Vercel / browser preview (`npm run web:build`).
// Electron production builds use electron.vite.config.ts instead.
// GitHub Pages serves project sites at /{repo}/ — set VITE_BASE=/SnapFlow/ for that build.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
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
