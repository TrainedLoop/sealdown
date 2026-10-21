import { readPref, writePref } from '../ui/prefs.ts'

/** A live document as this browser last saw it: the version the draft started from, and the draft. */
export type LocalLive = { base: number; baseText: string; draft: string }

const key = (id: string) => `sealdown.live.${id}`

function parse(raw: string | null): LocalLive | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as LocalLive
    return typeof value.base === 'number' && typeof value.baseText === 'string' && typeof value.draft === 'string' ? value : null
  } catch {
    return null
  }
}

// Two tabs on the same edit link share localStorage, so the last one to write wins there. Each tab
// also keeps its own copy in sessionStorage, which survives that tab's reloads.
function readSession(id: string): string | null {
  try {
    return sessionStorage.getItem(key(id))
  } catch {
    return null
  }
}

export function loadLocal(id: string): LocalLive | null {
  return parse(readSession(id)) ?? parse(readPref(key(id)))
}

export function saveLocal(id: string, state: LocalLive): void {
  const raw = JSON.stringify(state)
  writePref(key(id), raw)
  try {
    sessionStorage.setItem(key(id), raw)
  } catch {
    // Not persisting is acceptable, as with every preference.
  }
}
