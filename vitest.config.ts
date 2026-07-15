import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Pages/components use the automatic JSX runtime (no `import React`), same as
  // Next builds them — without this, importing a *.tsx page throws
  // "React is not defined" under the classic runtime.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
