import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // ponytail: single fork — DB-touching tests truncate shared tables, so they
    // must not run concurrently. Split into projects if the suite gets slow.
    // (Vitest 5 moved `poolOptions.forks.singleFork` to this top-level flag.)
    pool: 'forks',
    fileParallelism: false,
    setupFiles: ['tests/helpers/env.ts'],
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
