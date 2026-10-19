import { useSyncExternalStore, useState } from 'react'
import { readPref, writePref } from './prefs.ts'

export type Mode = 'write' | 'split' | 'read'

const KEY = 'sealdown.mode'
const SPLIT_QUERY = '(min-width: 900px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(SPLIT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Split needs room for two columns; on narrow screens it isn't offered and falls back to Write. */
export function useSplitAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(SPLIT_QUERY).matches)
}

/** The editor's view, remembered under `key` (each document type keeps its own). */
export function useMode(key = KEY): { mode: Mode; setMode: (mode: Mode) => void; splitAvailable: boolean } {
  const splitAvailable = useSplitAvailable()
  const [chosen, setChosen] = useState<Mode>(() => {
    const saved = readPref(key)
    if (saved === 'write' || saved === 'split' || saved === 'read') return saved
    return window.matchMedia(SPLIT_QUERY).matches ? 'split' : 'write'
  })
  const setMode = (mode: Mode) => {
    writePref(key, mode)
    setChosen(mode)
  }
  return { mode: chosen === 'split' && !splitAvailable ? 'write' : chosen, setMode, splitAvailable }
}
