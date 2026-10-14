/**
 * Guard: the app is plain CSS now. Tailwind must not come back as a
 * dependency, Vite plugin, or stylesheet import.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('no Tailwind', () => {
  it('does not list tailwind packages in workspace package.json files', () => {
    const paths = ['package.json', 'apps/web/package.json'];
    for (const rel of paths) {
      const json = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const names = [...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})];
      expect(names.filter((n) => n.includes('tailwind'))).toEqual([]);
    }
  });

  it('does not import tailwind in app.css or vite config', () => {
    const css = readFileSync(join(REPO_ROOT, 'apps/web/src/app.css'), 'utf8');
    const vite = readFileSync(join(REPO_ROOT, 'apps/web/vite.config.ts'), 'utf8');
    expect(css).not.toMatch(/tailwindcss/);
    expect(vite).not.toMatch(/tailwind/);
  });
});
