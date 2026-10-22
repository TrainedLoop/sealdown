import * as Y from 'yjs'
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates, type Awareness } from 'y-protocols/awareness'
import type { ConnectionStatus, Transport } from './channel.ts'
import { open, seal, type Envelope } from './crypto.ts'

/** Local edits are sent in batches this often. */
const BATCH_MS = 100
/** Cursor and presence changes at most this often (5 a second). */
const PRESENCE_MS = 200
/** A catch-up larger than this isn't broadcast: the newcomer has the stored state for that. */
const MAX_SYNC_BYTES = 200 * 1024

// A sync request's first byte: 1 on joining ("and send me yours too"), 0 when answering one.
const JOINING = 1
const ANSWERING = 0

type Options = {
  doc: Y.Doc
  awareness: Awareness
  transport: Transport
  /** The document key: every message is encrypted with it. */
  key: string
  /** The editors' signing key; null on a read link, which only listens. */
  sign: CryptoKey | null
  /** The editors' public key, to check what others send; null accepts no content. */
  verify: CryptoKey | null
}

type Events = { status: (status: ConnectionStatus) => void }

/**
 * Keeps a Y.Doc and its awareness in step with the other browsers on a live document, over
 * encrypted envelopes: local edits go out in batches, a joiner asks the others for what it lacks
 * (and tells them what they lack), and presence follows cursors. Updates commute, so the order in
 * which messages arrive doesn't matter.
 */
export class CollabProvider {
  status: ConnectionStatus = 'offline'
  private readonly opts: Options
  private readonly id = crypto.randomUUID()
  private pending: Uint8Array[] = []
  private batch: ReturnType<typeof setTimeout> | undefined
  private presence: ReturnType<typeof setTimeout> | undefined
  private queue: Promise<void> = Promise.resolve()
  private readonly listeners: { [K in keyof Events]: Set<Events[K]> } = { status: new Set() }
  private readonly offs: (() => void)[] = []
  private destroyed = false

  constructor(opts: Options) {
    this.opts = opts
    const { doc, awareness, transport } = opts
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === this || !opts.sign) return
      this.pending.push(update)
      this.batch ??= setTimeout(() => this.flush(), BATCH_MS)
    }
    doc.on('update', onUpdate)
    this.offs.push(() => doc.off('update', onUpdate))

    const onAwareness = (_: unknown, origin: unknown) => {
      if (origin === this || !opts.sign) return
      this.presence ??= setTimeout(() => {
        this.presence = undefined
        this.sendPresence()
      }, PRESENCE_MS)
    }
    awareness.on('update', onAwareness)
    this.offs.push(() => awareness.off('update', onAwareness))

    this.offs.push(transport.onMessage((env) => this.enqueue(env)))
    this.offs.push(
      transport.onStatus((status) => {
        const was = this.status
        this.status = status
        if (status === 'connected') this.requestSync(JOINING)
        if (status !== was) for (const cb of this.listeners.status) cb(status)
      }),
    )
  }

  on<K extends keyof Events>(event: K, cb: Events[K]): () => void {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }

  destroy(): void {
    if (this.destroyed) return
    this.flush()
    // Tell the others this person left, so their cursor disappears at once; the transport closes
    // once that last message (encrypted and signed, so not instant) is out.
    let last: Promise<void> = Promise.resolve()
    if (this.opts.sign) {
      removeAwarenessStates(this.opts.awareness, [this.opts.doc.clientID], this)
      last = this.send('presence', encodeAwarenessUpdate(this.opts.awareness, [this.opts.doc.clientID]))
    }
    this.destroyed = true
    clearTimeout(this.batch)
    clearTimeout(this.presence)
    for (const off of this.offs) off()
    void last.finally(() => this.opts.transport.close())
  }

  private flush() {
    this.batch = undefined
    if (this.pending.length === 0) return
    const update = Y.mergeUpdates(this.pending)
    this.pending = []
    void this.send('update', update)
  }

  private sendPresence() {
    void this.send('presence', encodeAwarenessUpdate(this.opts.awareness, [this.opts.doc.clientID]))
  }

  private requestSync(flag: number) {
    const vector = Y.encodeStateVector(this.opts.doc)
    void this.send('sync1', new Uint8Array([flag, ...vector]))
  }

  private async send(t: Envelope['t'], bytes: Uint8Array) {
    if (this.destroyed && t !== 'presence') return
    const { key, sign, transport } = this.opts
    const needsSignature = t !== 'sync1' && t !== 'saved'
    if (needsSignature && !sign) return
    transport.send(await seal(t, this.id, bytes, key, needsSignature ? (sign ?? undefined) : undefined))
  }

  private enqueue(env: Envelope) {
    if (env.s === this.id) return
    this.queue = this.queue.then(() => this.receive(env)).catch(() => undefined)
  }

  private async receive(env: Envelope) {
    const { doc, awareness, key, sign, verify } = this.opts
    const data = await open(env, key, verify)
    if (!data || this.destroyed) return
    switch (env.t) {
      case 'update':
      case 'sync2':
        Y.applyUpdate(doc, data, this)
        break
      case 'presence':
        applyAwarenessUpdate(awareness, data, this)
        break
      case 'sync1': {
        // Only editors answer: a reader's copy may hold nothing the others should trust.
        if (sign) {
          const missing = Y.encodeStateAsUpdate(doc, data.subarray(1))
          if (missing.length <= MAX_SYNC_BYTES) void this.send('sync2', missing)
          this.sendPresence()
        }
        if (data[0] === JOINING) this.requestSync(ANSWERING)
        break
      }
    }
  }
}
