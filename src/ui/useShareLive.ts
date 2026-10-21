import { useCallback, useState } from 'react'
import { createLiveDoc, createProtectedLiveDoc } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import type { DocType } from '../share/docType.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { loadAuthor } from '../live/author.ts'
import { track } from '../analytics.ts'

export type SharedLive = { edit: string; read: string; protected: boolean }

/** "Share to edit" on an editor page: publishes the current text as a live document. */
export function useShareLive(docType: DocType) {
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState<SharedLive | null>(null)
  const [failed, setFailed] = useState(false)
  const close = useCallback(() => setShared(null), [])

  /** With a password, the key is derived from it and neither link carries one. */
  async function share(text: string, password = '') {
    setBusy(true)
    setFailed(false)
    try {
      const doc = { type: docType, text }
      const author = loadAuthor() ?? ''
      const { edit, read } = password
        ? await createProtectedLiveDoc(doc, author, password, defaultLiveStorage)
        : await createLiveDoc(doc, author, defaultLiveStorage)
      const base = window.location.origin + import.meta.env.BASE_URL
      track('live_created', { protected: password !== '' })
      setShared({ edit: base + buildHash(edit), read: base + buildHash(read), protected: password !== '' })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, shared, failed, share, close }
}
