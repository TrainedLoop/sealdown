import { liveChannel } from '../realtime.ts'
import type { Envelope } from './crypto.ts'

export type ConnectionStatus = 'connected' | 'offline'

/** How envelopes travel between the browsers on one live document. */
export type Transport = {
  send(env: Envelope): void
  onMessage(cb: (env: Envelope) => void): () => void
  onStatus(cb: (status: ConnectionStatus) => void): () => void
  close(): void
}

const EVENT = 'm'

/** Over the document's Supabase Realtime broadcast channel. */
export function realtimeTransport(id: string): Transport {
  const entry = liveChannel(id)
  const offs: (() => void)[] = []
  let closed = false
  return {
    send(env) {
      void entry
        .then((joined) => (closed ? undefined : joined?.channel.send({ type: 'broadcast', event: EVENT, payload: env })))
        .catch(() => undefined)
    },
    onMessage(cb) {
      let active = true
      void entry.then((joined) =>
        joined?.channel.on('broadcast', { event: EVENT }, ({ payload }) => {
          if (active && !closed && payload && typeof payload === 'object') cb(payload as Envelope)
        }),
      )
      const off = () => {
        active = false
      }
      offs.push(off)
      return off
    },
    onStatus(cb) {
      let listener: ((s: ConnectionStatus) => void) | null = null
      void entry.then((joined) => {
        if (!joined || closed) return cb('offline')
        listener = (s) => cb(s)
        joined.listeners.add(listener)
        cb(joined.status)
      })
      const off = () => void entry.then((joined) => listener && joined?.listeners.delete(listener))
      offs.push(off)
      return off
    },
    close() {
      closed = true
      for (const off of offs) off()
    },
  }
}

/** In-memory transports for tests: a message reaches every other online transport. */
export function memoryHub() {
  type Member = { online: boolean; closed: boolean; messages: Set<(env: Envelope) => void>; statuses: Set<(s: ConnectionStatus) => void> }
  const members = new Map<Transport, Member>()
  return {
    transport(): Transport {
      const member: Member = { online: true, closed: false, messages: new Set(), statuses: new Set() }
      const transport: Transport = {
        send(env) {
          if (!member.online || member.closed) return
          for (const [other, m] of members) {
            if (other !== transport && m.online && !m.closed) for (const cb of m.messages) cb(structuredClone(env))
          }
        },
        onMessage(cb) {
          member.messages.add(cb)
          return () => member.messages.delete(cb)
        },
        onStatus(cb) {
          member.statuses.add(cb)
          cb(member.online ? 'connected' : 'offline')
          return () => member.statuses.delete(cb)
        },
        close() {
          member.closed = true
        },
      }
      members.set(transport, member)
      return transport
    },
    setOnline(transport: Transport, online: boolean) {
      const member = members.get(transport)!
      member.online = online
      for (const cb of member.statuses) cb(online ? 'connected' : 'offline')
    },
  }
}
