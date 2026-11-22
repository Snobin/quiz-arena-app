import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests don't load the PWA plugin or the dev proxy.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Per-test ceiling: the file-scanning checks and lazy screens are slow under coverage instrumentation.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    // Report only, no thresholds: run `npm run coverage`, open coverage/index.html.
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/test-utils/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
