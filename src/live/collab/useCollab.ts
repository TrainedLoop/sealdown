import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { defaultLiveStorage } from '../../storage/live.ts'
import { openLive, type LiveRoute, type Opened } from '../session.ts'
import { realtimeTransport, type ConnectionStatus } from './channel.ts'
import { signingKey, verifyingKey } from './crypto.ts'
import { loadLocalState } from './persistence.ts'
import { CollabProvider } from './provider.ts'
import { seedUpdate, TEXT } from './seed.ts'

/** How often the saved state is checked, in case something was missed while away. */
const CATCH_UP_MS = 30_000

// Cursor colours: the validated categorical palette, picked by the editor's Yjs client id.
const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

export type Peer = { clientId: number; name: string; color: string }

export type Collab = {
  doc: Y.Doc
  text: Y.Text
  awareness: Awareness
  provider: CollabProvider
  status: ConnectionStatus
  peers: Peer[]
}

/**
 * The shared Markdown of a live document: a Y.Doc started from the stored state (or seeded from
 * the stored text), plus this browser's offline work, kept in step with the others over Realtime.
 * `token` (edit links only) signs what this tab sends; without it the tab only listens.
 */
export function useCollab(route: LiveRoute, opened: Opened, name: string | null): Collab | null {
  const [collab, setCollab] = useState<Collab | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('offline')
  const [peers, setPeers] = useState<Peer[]>([])
  const token = route.kind === 'live-edit' ? route.token : null
  const { id, key } = route

  useEffect(() => {
    let cancelled = false
    let provider: CollabProvider | null = null
    let awareness: Awareness | null = null
    const cleanups: (() => void)[] = []
    const doc = new Y.Doc()
    Y.applyUpdate(doc, opened.state ?? seedUpdate(opened.doc.text), 'storage')
    const local = token ? loadLocalState(id) : null
    if (local) Y.applyUpdate(doc, local, 'local-storage')
    ;(async () => {
      // Editors derive the key pair from the token; readers check with the stored public key.
      const signer = token ? await signingKey(token) : null
      const publicKey = signer?.publicKey ?? opened.signKey
      const verify = publicKey ? await verifyingKey(publicKey) : null
      if (cancelled) return
      awareness = new Awareness(doc)
      if (!token) awareness.setLocalState(null) // readers are not shown
      provider = new CollabProvider({ doc, awareness, transport: realtimeTransport(id), key, sign: signer?.sign ?? null, verify })
      provider.on('status', setStatus)
      // Others answer a rejoin with what they hold; when nobody is online (or the gap is too large to
      // send), the saved state fills it. Checked on every (re)connection and every 30 s.
      let known = opened.revision
      const catchUp = async () => {
        try {
          if ((await defaultLiveStorage.head(id)) <= known) return
          const latest = await openLive(route, defaultLiveStorage)
          if (cancelled) return
          known = latest.revision
          if (latest.state) Y.applyUpdate(doc, latest.state, 'storage')
        } catch {
          // Next time.
        }
      }
      provider.on('status', (next) => next === 'connected' && void catchUp())
      const poll = setInterval(() => void catchUp(), CATCH_UP_MS)
      cleanups.push(() => clearInterval(poll))
      void catchUp()
      // Leaving (closing the tab, navigating away) takes this person's cursor off the others' screens.
      const leave = () => provider?.destroy()
      window.addEventListener('pagehide', leave)
      cleanups.push(() => window.removeEventListener('pagehide', leave))
      setStatus(provider.status)
      const updatePeers = () => {
        const list: Peer[] = []
        awareness!.getStates().forEach((state, clientId) => {
          const user = (state as { user?: { name?: string; color?: string } }).user
          if (clientId !== doc.clientID && user?.name) list.push({ clientId, name: user.name, color: user.color ?? COLORS[0] })
        })
        setPeers(list)
      }
      awareness.on('change', updatePeers)
      setCollab({ doc, text: doc.getText(TEXT), awareness, provider, status: provider.status, peers: [] })
    })()
    return () => {
      cancelled = true
      for (const cleanup of cleanups) cleanup()
      provider?.destroy()
      awareness?.destroy()
      doc.destroy()
    }
    // One collaboration per document and key; `opened` is the state it starts from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, token])

  // This editor's name and colour on everyone else's screen.
  useEffect(() => {
    if (!collab || !token) return
    const color = COLORS[collab.doc.clientID % COLORS.length]
    collab.awareness.setLocalStateField('user', { name: name || '…', color, colorLight: `${color}33` })
  }, [collab, name, token])

  return collab && { ...collab, status, peers }
}
