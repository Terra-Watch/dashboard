import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: './.playwright-output',
  use: { baseURL: 'http://127.0.0.1:4188', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4188',
    cwd: '..',
    port: 4188,
    reuseExistingServer: true,
  },
});
