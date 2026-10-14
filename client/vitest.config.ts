import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Starting a jsdom worker is slow on synced folders (e.g. OneDrive); run files
    // one after another in a single thread so start-up doesn't time out.
    pool: 'threads',
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
