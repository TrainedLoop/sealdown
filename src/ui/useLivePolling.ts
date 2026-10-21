import { useEffect, useState } from 'react'
import { listVersions, type LiveRoute } from '../live/session.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import type { Newer } from './LiveBar.tsx'

const POLL_MS = 30_000

/** Checks for a version newer than `version` every 30 s while the tab is visible. */
export function useLivePolling(route: LiveRoute | null, version: number | null): [Newer | null, () => void] {
  const [newer, setNewer] = useState<Newer | null>(null)
  const id = route?.id
  const key = route?.key
  useEffect(() => {
    if (!id || !key || version === null) return
    let cancelled = false
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const head = await defaultLiveStorage.head(id)
        if (cancelled || head <= version) return
        // Only the version list: the author's name without downloading the document.
        const [latest] = await listVersions({ kind: 'live-read', id, key }, defaultLiveStorage)
        if (!cancelled) setNewer({ version: head, author: latest?.version === head ? latest.author : '' })
      } catch {
        // Polling is best effort; the next tick tries again.
      }
    }
    const timer = setInterval(() => void check(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [id, key, version])
  return [newer && version !== null && newer.version > version ? newer : null, () => setNewer(null)]
}
