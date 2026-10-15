// The product was called rendermd; its browser storage keys moved to the sealdown prefix.
const OLD_PREFIX = 'rendermd.'
const NEW_PREFIX = 'sealdown.'
const KEYS = ['draft', 'theme', 'lang', 'mode', 'syncScroll', 'typeset']

/** Copies values saved under the old prefix to the new one (never overwriting), then removes them. */
export function migratePrefs(): void {
  try {
    for (const key of KEYS) {
      const old = localStorage.getItem(OLD_PREFIX + key)
      if (old === null) continue
      if (localStorage.getItem(NEW_PREFIX + key) === null) localStorage.setItem(NEW_PREFIX + key, old)
      localStorage.removeItem(OLD_PREFIX + key)
    }
  } catch {
    // Storage blocked: nothing to migrate.
  }
}
