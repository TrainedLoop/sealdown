// The key of a password-protected live document, kept for this tab only (sessionStorage): a reload
// doesn't ask for the password again, and nothing stays behind once the tab is closed.
const keyName = (id: string) => `sealdown.livekey.${id}`

export function storedLiveKey(id: string): string | null {
  try {
    return sessionStorage.getItem(keyName(id))
  } catch {
    return null
  }
}

export function storeLiveKey(id: string, key: string): void {
  try {
    sessionStorage.setItem(keyName(id), key)
  } catch {
    // Not remembering it only means asking again after a reload.
  }
}

// The links a tab has just shared, shown once by the live page it moves to.
const SHARED = 'sealdown.justShared'
export type JustShared = { id: string; edit: string; read: string; protected: boolean }

export function rememberShared(shared: JustShared): void {
  try {
    sessionStorage.setItem(SHARED, JSON.stringify(shared))
  } catch {
    // The live page then opens without the links dialog; Copy read link still works.
  }
}

/** The links just shared for document `id`, once. */
export function takeShared(id: string): JustShared | null {
  try {
    const raw = sessionStorage.getItem(SHARED)
    const shared = raw ? (JSON.parse(raw) as JustShared) : null
    if (!shared || shared.id !== id) return null
    sessionStorage.removeItem(SHARED)
    return shared
  } catch {
    return null
  }
}
