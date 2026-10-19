import { useEffect, useState } from 'react'
import { readPref, writePref } from './prefs.ts'

export type Theme = 'light' | 'dark'

const KEY = 'sealdown.theme'

function initialTheme(): Theme {
  const saved = readPref(KEY)
  // Dark is Sealdown's identity; light is a choice, not inferred from the system.
  return saved === 'light' ? 'light' : 'dark'
}

/** Saved choice, else dark. Mirrored on <html data-theme>. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const setTheme = (next: Theme) => {
    writePref(KEY, next)
    setThemeState(next)
  }
  return [theme, setTheme]
}
