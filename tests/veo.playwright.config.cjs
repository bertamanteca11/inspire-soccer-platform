const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'veo.ui.spec.cjs',
  workers: 1,
  timeout: 45000,
  outputDir: '../.veo-test-artifacts/results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175', headless: true,
    channel: process.env.VEO_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175', reuseExistingServer: false, timeout: 30000 },
});
