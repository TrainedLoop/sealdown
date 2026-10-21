import { useEffect, useRef } from 'react'
import { watchLive } from '../live/realtime.ts'
import type { LiveRoute } from '../live/session.ts'
import { defaultLiveStorage } from '../storage/live.ts'

/** Backup for the Realtime push (a dropped connection, a blocked websocket). */
export const POLL_MS = 30_000

/**
 * Calls `onNewer` as soon as another browser saves past `version`: pushed over Realtime, and
 * checked every 30 s while the tab is visible in case a push was missed (one tiny request).
 */
export function useLivePolling(route: LiveRoute | null, version: number | null, onNewer: (head: number) => void): void {
  const callback = useRef(onNewer)
  useEffect(() => {
    callback.current = onNewer
  })
  const id = route?.id
  const known = useRef(version)
  useEffect(() => {
    known.current = version
  }, [version])
  useEffect(() => {
    if (!id) return
    return watchLive(id, (saved) => {
      if (known.current !== null && saved > known.current) callback.current(saved)
    })
  }, [id])
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
