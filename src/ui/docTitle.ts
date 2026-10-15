import { useEffect, useSyncExternalStore } from 'react'
import { documentTitle } from '../render/title.ts'

// The current document's title, shared by the page showing a document and the header.
let current: string | null = null
const listeners = new Set<() => void>()

function set(title: string | null) {
  if (title === current) return
  current = title
  document.title = title ? `${title} · sealdown` : 'sealdown'
  for (const listener of listeners) listener()
}

/** Publishes the title of `markdown` while the calling page is mounted. */
export function useDocumentTitle(markdown: string | null): void {
  useEffect(() => set(markdown === null ? null : documentTitle(markdown)), [markdown])
  useEffect(() => () => set(null), [])
}

export function useCurrentTitle(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
