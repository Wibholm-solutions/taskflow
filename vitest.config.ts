import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./client/tests/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.worktrees/**', 'dist/**'],
  },
});
