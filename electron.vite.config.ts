import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const PRELOAD_ENTRIES: Record<string, string> = {
  index: resolve('src/preload/index.ts'),
  overlay: resolve('src/preload/overlay.ts'),
  'picker-overlay': resolve('src/preload/picker-overlay.ts'),
  'recording-worker': resolve('src/preload/recording-worker.ts'),
  'recording-control': resolve('src/preload/recording-control.ts'),
};

/**
 * Sandboxed preloads may only `require('electron')`. Rollup splits shared `channels` into
 * `out/preload/chunks/*`, which breaks at runtime — rebundle each entry with esbuild.
 */
function selfContainedPreloadPlugin(): Plugin {
  return {
    name: 'snapflow-self-contained-preload',
    apply: 'build',
    async closeBundle() {
      const esbuild = await import('esbuild');
      const outDir = resolve('out/preload');
      await rm(resolve(outDir, 'chunks'), { recursive: true, force: true });
      for (const [name, entry] of Object.entries(PRELOAD_ENTRIES)) {
        await esbuild.build({
          entryPoints: [entry],
          outfile: resolve(outDir, `${name}.js`),
          bundle: true,
          platform: 'node',
          target: 'node20',
          format: 'cjs',
          external: ['electron'],
          logLevel: 'silent',
        });
      }
    },
  };
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin(), selfContainedPreloadPlugin()],
    build: {
      rollupOptions: {
        input: PRELOAD_ENTRIES,
      },
    },
  },
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
