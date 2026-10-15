import { migratePrefs } from './ui/migratePrefs.ts'

// Runs before any module reads saved preferences (imported first by main.tsx).
migratePrefs()
