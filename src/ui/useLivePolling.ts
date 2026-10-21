import { useEffect, useRef } from 'react'
import type { LiveRoute } from '../live/session.ts'
import { defaultLiveStorage } from '../storage/live.ts'

export const POLL_MS = 5_000

/**
 * Asks for the latest version number every 5 s while the tab is visible, and calls `onNewer` when
 * it is past `version`. One tiny request (a number), no document, so it stays cheap.
 */
export function useLivePolling(route: LiveRoute | null, version: number | null, onNewer: (head: number) => void): void {
  const callback = useRef(onNewer)
  useEffect(() => {
    callback.current = onNewer
  })
  const id = route?.id
  useEffect(() => {
    if (!id || version === null) return
    let cancelled = false
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const head = await defaultLiveStorage.head(id)
        if (!cancelled && head > version) callback.current(head)
      } catch {
        // Best effort; the next tick tries again.
      }
    }
    const timer = setInterval(() => void check(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [id, version])
}
