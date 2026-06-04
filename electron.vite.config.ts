import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  // Two preload entry points: the dashboard bridge and the overlay bridge.
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), overlay: resolve('src/preload/overlay.ts') },
      },
    },
  },
  // Two renderer pages: the dashboard (React) and the region overlay (plain TS).
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), overlay: resolve('src/renderer/overlay.html') },
      },
    },
  },
});
