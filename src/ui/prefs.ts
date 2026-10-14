/**
 * localStorage that never throws: private windows, blocked site data and full quotas all degrade to
 * "nothing saved" instead of breaking the page.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not persisting is acceptable; see above.
  }
}
