import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173/', locale: 'en-US' },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    { name: 'chromium', testDir: 'tests/e2e', testIgnore: 'stored.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'visual', testDir: 'tests/visual', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Built without Supabase variables, so storage is unavailable unless a test routes it.
    command: 'node_modules/.bin/vite build && node_modules/.bin/vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
