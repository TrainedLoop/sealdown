// The product was called rendermd; its browser storage keys moved to the sealdown prefix.
const OLD_PREFIX = 'rendermd.'
const NEW_PREFIX = 'sealdown.'
const KEYS = ['draft', 'theme', 'lang', 'mode', 'syncScroll', 'typeset']

/**
 * Moves values saved under the old prefix to the new one, never overwriting a newer value.
 * Each key is removed before its copy is written, so a draft near the storage quota still fits;
 * if the write fails anyway, the old value is put back. Keys are independent of each other.
 */
export function migratePrefs(): void {
  for (const key of KEYS) {
    try {
      const old = localStorage.getItem(OLD_PREFIX + key)
      if (old === null) continue
      const hasNew = localStorage.getItem(NEW_PREFIX + key) !== null
      localStorage.removeItem(OLD_PREFIX + key)
      if (hasNew) continue
      try {
        localStorage.setItem(NEW_PREFIX + key, old)
      } catch {
        localStorage.setItem(OLD_PREFIX + key, old)
      }
    } catch {
      // Storage blocked for this key: leave it.
    }
  }
}
