import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const wsPort = env.PORT ?? '5174';

  return {
    plugins: [svelte()],
    server: {
      proxy: {
        '/ws': {
          target: `ws://127.0.0.1:${wsPort}`,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
