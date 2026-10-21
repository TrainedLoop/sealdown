import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js'
import { supabaseConfig } from '../storage/storage.ts'

// Instant "a new version was saved" between the browsers on one live document, over a Supabase
// Realtime broadcast channel. The message carries only the version number: receivers fetch and
// decrypt the version as usual, so a fake message costs one request and changes nothing.

const EVENT = 'saved'
let client: Promise<RealtimeClient | null> | null = null
const channels = new Map<string, Promise<RealtimeChannel | null>>()

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

function channel(id: string): Promise<RealtimeChannel | null> {
  let joined = channels.get(id)
  if (!joined) {
    joined = connect().then((realtime) => {
      if (!realtime) return null
      const ch = realtime.channel(`sealdown-live-${id}`, { config: { broadcast: { self: false } } })
      ch.subscribe()
      return ch
    })
    channels.set(id, joined)
  }
  return joined
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
