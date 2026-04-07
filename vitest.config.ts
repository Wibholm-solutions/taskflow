import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./client/tests/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.worktrees/**', '.claude/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['client/src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: [
        'client/tests/**',
        'server/tests/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'client/src/main.tsx',
        'server/src/index.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 63.84,
        statements: 63.84,
        functions: 66.66,
        branches: 78.16,
      },
    },
  },
});
