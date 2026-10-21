import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  // Each test starts its own Shifted. Run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results'
})
