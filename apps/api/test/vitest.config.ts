import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const apiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  test: {
    // Absolute: Vite resolves a relative `root` against `process.cwd()`, not the config file.
    root: apiRoot,
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
