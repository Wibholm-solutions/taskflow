import { defineConfig } from '@playwright/test';

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:3000${basePath === '/' ? '' : basePath}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: true,
    env: {
      DATABASE_PATH: './data/test.db',
      BASE_PATH: basePath,
      PORT: '3000',
      NODE_ENV: 'test',
    },
  },
});
