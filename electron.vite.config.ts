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
        input: {
          index: resolve('src/preload/index.ts'),
          overlay: resolve('src/preload/overlay.ts'),
          'picker-overlay': resolve('src/preload/picker-overlay.ts'),
          'recording-worker': resolve('src/preload/recording-worker.ts'),
          'recording-control': resolve('src/preload/recording-control.ts'),
        },
      },
    },
  },
  // Two renderer pages: the dashboard (React) and the region overlay (plain TS).
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          'picker-overlay': resolve('src/renderer/picker-overlay.html'),
          'recording-worker': resolve('src/renderer/recording-worker.html'),
          'recording-control': resolve('src/renderer/recording-control.html'),
          'recording-indicator': resolve('src/renderer/recording-indicator.html'),
        },
      },
    },
  },
});
