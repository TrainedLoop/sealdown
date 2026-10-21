import { useState } from 'react'
import { createLiveDoc, createProtectedLiveDoc } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import type { DocType } from '../share/docType.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { loadAuthor } from '../live/author.ts'
import { rememberShared, storeLiveKey } from '../live/keyStore.ts'
import { track } from '../analytics.ts'

/** "Share to edit" on an editor page: publishes the current text as a live document. */
export function useShareLive(docType: DocType) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  /** With a password, the key is derived from it and neither link carries one. */
  async function share(text: string, password = '') {
    setBusy(true)
    setFailed(false)
    try {
      const doc = { type: docType, text }
      const author = loadAuthor() ?? ''
      const created = password
        ? await createProtectedLiveDoc(doc, author, password, defaultLiveStorage)
        : await createLiveDoc(doc, author, defaultLiveStorage)
      const { edit, read } = created
      // The person who shared knows the password: their tab opens the document without asking.
      if ('key' in created) storeLiveKey(edit.id, created.key)
      const base = window.location.origin + import.meta.env.BASE_URL
      track('live_created', { protected: password !== '' })
      // This tab becomes the live document; it shows the links once it is there.
      rememberShared({ id: edit.id, edit: base + buildHash(edit), read: base + buildHash(read), protected: password !== '' })
      window.location.hash = buildHash(edit)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, failed, share }
}
