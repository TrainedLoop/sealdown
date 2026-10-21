import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// Run through scripts/e2e-stored.sh, which provides the local Supabase variables.
export default defineConfig({
  ...base,
  projects: [{ name: 'stored', testDir: 'tests/e2e', testMatch: ['stored.spec.ts', 'live*.spec.ts'], use: base.projects?.[0]?.use }],
  use: { ...base.use, baseURL: 'http://localhost:4318/' },
  webServer: {
    command: 'node_modules/.bin/vite build --outDir dist-stored && node_modules/.bin/vite preview --outDir dist-stored --port 4318 --strictPort',
    url: 'http://localhost:4318/',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
      // As in the main config: PostHog goes to the preview server so tests can read what is sent.
      VITE_POSTHOG_KEY: 'phc_test',
      VITE_POSTHOG_HOST: 'http://localhost:4318/ph',
    },
  },
})
