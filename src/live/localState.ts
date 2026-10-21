import { readPref, writePref } from '../ui/prefs.ts'

/** A live document as this browser last saw it: the version the draft started from, and the draft. */
export type LocalLive = { base: number; baseText: string; draft: string }

const key = (id: string) => `sealdown.live.${id}`

export function loadLocal(id: string): LocalLive | null {
  const raw = readPref(key(id))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as LocalLive
    return typeof value.base === 'number' && typeof value.baseText === 'string' && typeof value.draft === 'string' ? value : null
  } catch {
    return null
  }
}

export function saveLocal(id: string, state: LocalLive): void {
  writePref(key(id), JSON.stringify(state))
}
