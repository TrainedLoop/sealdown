import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// Run through scripts/e2e-stored.sh, which provides the local Supabase variables.
export default defineConfig({
  ...base,
  testMatch: 'stored.spec.ts',
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://localhost:4174/' },
  webServer: {
    command: 'node_modules/.bin/vite build --outDir dist-stored && node_modules/.bin/vite preview --outDir dist-stored --port 4174 --strictPort',
    url: 'http://localhost:4174/',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
  },
})
