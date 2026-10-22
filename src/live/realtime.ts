import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js'
import { supabaseConfig } from '../storage/storage.ts'

// Instant "a new version was saved" between the browsers on one live document, over a Supabase
// Realtime broadcast channel. The message carries only the version number: receivers fetch and
// decrypt the version as usual, so a fake message costs one request and changes nothing.

const EVENT = 'saved'
let client: Promise<RealtimeClient | null> | null = null

function connect(): Promise<RealtimeClient | null> {
  const { url, anonKey } = supabaseConfig
  if (!url || !anonKey) return Promise.resolve(null)
  // Loaded only on live document pages.
  client ??= import('@supabase/realtime-js').then(
    ({ RealtimeClient }) => new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: anonKey } }),
    () => null,
  )
  return client
}

type Joined = { channel: RealtimeChannel; status: 'connected' | 'offline'; listeners: Set<(status: 'connected' | 'offline') => void> }
const joined = new Map<string, Promise<Joined | null>>()

/**
 * The page's one Realtime channel for live document `id` (shared by the collaboration transport and
 * the JSON "saved" announcements), with its connection status. Realtime rejoins on its own after a
 * drop; every rejoin reports 'connected' again.
 */
export function liveChannel(id: string): Promise<Joined | null> {
  let found = joined.get(id)
  if (!found) {
    found = connect().then((realtime) => {
      if (!realtime) return null
      const entry: Joined = { channel: realtime.channel(`sealdown-live-${id}`, { config: { broadcast: { self: false } } }), status: 'offline', listeners: new Set() }
      entry.channel.subscribe((status) => {
        const next = status === 'SUBSCRIBED' ? 'connected' : 'offline'
        if (next === entry.status) return
        entry.status = next
        for (const listener of entry.listeners) listener(next)
      })
      return entry
    })
    joined.set(id, found)
  }
  return found
}

function channel(id: string): Promise<RealtimeChannel | null> {
  return liveChannel(id).then((entry) => entry?.channel ?? null)
}

/** Calls `onSaved` with the version number whenever another browser saves this document. */
export function watchLive(id: string, onSaved: (version: number) => void): () => void {
  let active = true
  void channel(id).then((ch) =>
    ch?.on('broadcast', { event: EVENT }, ({ payload }) => {
      const version = Number((payload as { version?: unknown })?.version)
      if (active && Number.isInteger(version)) onSaved(version)
    }),
  )
  return () => {
    active = false
  }
}

/** Tells the other browsers on this document that `version` was just saved. Best effort. */
export function announceLive(id: string, version: number): void {
  void channel(id)
    .then((ch) => ch?.send({ type: 'broadcast', event: EVENT, payload: { version } }))
    .catch(() => undefined)
}
