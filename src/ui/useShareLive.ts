import { useCallback, useState } from 'react'
import { createLiveDoc } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import type { DocType } from '../share/docType.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { loadAuthor } from '../live/author.ts'

export type SharedLive = { edit: string; read: string }

/** "Share to edit" on an editor page: publishes the current text as a live document. */
export function useShareLive(docType: DocType) {
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState<SharedLive | null>(null)
  const [failed, setFailed] = useState(false)
  const close = useCallback(() => setShared(null), [])

  async function share(text: string) {
    setBusy(true)
    setFailed(false)
    try {
      const { edit, read } = await createLiveDoc({ type: docType, text }, loadAuthor() ?? '', defaultLiveStorage)
      const base = window.location.origin + import.meta.env.BASE_URL
      setShared({ edit: base + buildHash(edit), read: base + buildHash(read) })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, shared, failed, share, close }
}
