import { defineConfig, devices } from '@playwright/test';
// Runs the checks that need the production build (service worker, offline): `npm run build` first.
export default defineConfig({
  testDir: './tests', testMatch: /pwa\.spec\.ts/, outputDir: './.playwright-output',
  use: { baseURL: 'http://127.0.0.1:4189', ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined } },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4189 --strictPort', port: 4189, reuseExistingServer: false },
});
