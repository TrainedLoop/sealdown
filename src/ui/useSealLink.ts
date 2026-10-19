import { useCallback, useEffect, useRef, useState } from 'react'
import { diagramTypes, track } from '../analytics.ts'
import { encodeDoc, type DocType } from '../share/docType.ts'
import { createLink } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import type { SealResult } from './SealModal.tsx'

/** "Seal link" for an editor page: the password, the in-flight state and the dialog's result. */
export function useSealLink(text: string, docType: DocType) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState<SealResult | null>(null)
  const sealButton = useRef<HTMLButtonElement>(null)
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
  }, [text])

  // Stable, so the dialog's keyboard and focus effect runs once per opening.
  const closeSeal = useCallback(() => {
    setShared(null)
    sealButton.current?.focus()
  }, [])

  // A link for a previous text would be misleading.
  const clearSeal = useCallback(() => setShared(null), [])

  async function generate() {
    setBusy(true)
    const source = text
    try {
      const result = await createLink(encodeDoc({ type: docType, text: source }), {
        storage: defaultStorage,
        baseUrl: window.location.origin + import.meta.env.BASE_URL,
        password: password || undefined,
      })
      // Edited while the link was being made: that link is for a version that no longer exists.
      if (latest.current !== source) return
      const types = docType === 'markdown' ? diagramTypes(source) : null
      track('link_created', {
        result: result.kind === 'too-large' ? 'too_large' : result.kind,
        storage: result.kind !== 'too-large' && /#\/[sq]\//.test(result.url) ? 'stored' : 'inline',
        protected: password !== '',
        doc_type: docType,
        size_kb: Math.round(new Blob([source]).size / 1024),
        ...(types && { diagram_count: types.length, diagram_types: types }),
      })
      if (result.kind === 'too-large') {
        setShared({ kind: 'too-large' })
        return
      }
      let copied = false
      try {
        await navigator.clipboard.writeText(result.url)
        copied = true
      } catch {
        // Clipboard blocked or unavailable: the link is still shown for manual copying.
      }
      setShared({
        kind: 'link',
        url: result.url,
        fallback: result.kind === 'fallback',
        copied,
        protected: password !== '',
        stored: /#\/[sq]\//.test(result.url),
      })
    } catch {
      if (latest.current === source) {
        track('link_created', { result: 'failed', protected: password !== '', doc_type: docType })
        setShared({ kind: 'failed' })
      }
    } finally {
      setBusy(false)
    }
  }

  return { password, setPassword, busy, generate, shared, closeSeal, clearSeal, sealButton }
}

export type SealLink = ReturnType<typeof useSealLink>
