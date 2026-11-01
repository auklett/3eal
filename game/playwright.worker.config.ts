import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/return-to-lobby.worker.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  timeout: 240_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: 'npm run build && npx wrangler dev --local --ip 127.0.0.1 --port 8790 --var TURNSTILE_SECRET: --var TURNSTILE_SECRET_KEY:',
      url: 'http://127.0.0.1:8790/api/config',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ]
});
