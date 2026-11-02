const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname, testMatch: 'shell.ui.spec.cjs', workers: 1,
  outputDir: '../.phase4-test-artifacts/shell', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', headless: true, channel: process.env.VEO_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178/tests/shell.html', reuseExistingServer: false, timeout: 30000 },
});
