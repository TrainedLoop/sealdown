import { useEffect, useState } from 'react'
import { readPref, writePref } from './prefs.ts'

export type Theme = 'light' | 'dark'

const KEY = 'rendermd.theme'

function initialTheme(): Theme {
  const saved = readPref(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Saved choice, else the system preference. Mirrored on <html data-theme>. */
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
