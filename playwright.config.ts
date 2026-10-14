import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4317/', locale: 'en-US' },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    { name: 'chromium', testDir: 'tests/e2e', testIgnore: 'stored.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'visual', testDir: 'tests/visual', use: { ...devices['Desktop Chrome'] } },
    // Generates the diagram-menu thumbnails (pnpm thumbs); not part of the test suites.
    { name: 'thumbs', testDir: 'tests/thumbs', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Built without Supabase variables, so storage is unavailable unless a test routes it.
    command: 'node_modules/.bin/vite build && node_modules/.bin/vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317/',
    // Never reuse: other projects on this machine also run Vite previews.
    reuseExistingServer: false,
    // PostHog points at a path on the preview server so tests can capture what would be sent.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_POSTHOG_KEY: 'phc_test',
      VITE_POSTHOG_HOST: 'http://localhost:4317/ph',
    },
  },
})
