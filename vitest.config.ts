import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Vitest projects:
 * - `node` project: unit + server-adapter tests (no `browser` condition, so the
 *   `ws` Node build is used). Excludes `test/dom/**`.
 * - `jsdom` project: Svelte component tests in `test/dom/**` with the `browser`
 *   condition so Svelte resolves its client build (mount works in jsdom).
 */
export default defineConfig({
  plugins: [
    svelte({
      // Never compile library internals (e.g. @testing-library/svelte-core's
      // props.svelte.js which imports svelte/internal/client as `$`).
      exclude: [/node_modules/],
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/dom/**', 'node_modules/**'],
          globals: false,
        },
      },
      {
        extends: true,
        resolve: {
          conditions: ['browser', 'module', 'import', 'default'],
        },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['test/dom/**/*.test.ts'],
          globals: false,
        },
      },
    ],
  },
});
