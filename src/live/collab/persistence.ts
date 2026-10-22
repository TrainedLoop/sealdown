import * as Y from 'yjs'
import { fromBase64, toBase64 } from '../../share/base64url.ts'
import { LiveError, type LiveErrorKind, type LiveStorage } from '../../storage/live.ts'
import { readPref, writePref } from '../../ui/prefs.ts'
import { checkpointDue, QUIET_AFTER_MS } from '../checkpoints.ts'
import type { LiveEditRoute } from '../links.ts'
import { checkpointNow, openLive, saveCollabState } from '../session.ts'
import { TEXT } from './seed.ts'

const SAVE_DELAY_MS = 2000
const RETRY_MIN_MS = 5000
const RETRY_MAX_MS = 60_000
const LOCAL_DELAY_MS = 500

export type PersistenceStatus = 'saved' | 'saving' | LiveErrorKind

// The Yjs state in this browser: a reload or offline work starts from it.
const localKey = (id: string) => `sealdown.ystate.${id}`

export function loadLocalState(id: string): Uint8Array | null {
  const raw = readPref(localKey(id))
  if (!raw) return null
  try {
    return fromBase64(raw)
  } catch {
    return null
  }
}

/** Adds to what is kept: other tabs of this browser may hold work this one hasn't seen (offline). */
export function saveLocalState(id: string, doc: Y.Doc): void {
  const own = Y.encodeStateAsUpdate(doc)
  const kept = loadLocalState(id)
  let merged = own
  if (kept) {
    try {
      merged = Y.mergeUpdates([kept, own])
    } catch {
      // A damaged copy is replaced by this tab's state.
    }
  }
  writePref(localKey(id), toBase64(merged))
}

/** True when `doc` holds anything the stored state lacks (offline work, edits never saved). */
function aheadOf(doc: Y.Doc, stored: Uint8Array): boolean {
  const server = new Y.Doc()
  Y.applyUpdate(server, stored)
  const known = Y.decodeStateVector(Y.encodeStateVector(server))
  const ahead = [...Y.decodeStateVector(Y.encodeStateVector(doc))].some(([client, clock]) => clock > (known.get(client) ?? 0))
  const differs = server.getText(TEXT).toString() !== doc.getText(TEXT).toString()
  server.destroy()
  return ahead || differs
}

type Options = {
  route: LiveEditRoute
  doc: Y.Doc
  storage: LiveStorage
  /** The revision the document was opened at. */
  revision: number
  /** True for edits made in this tab (not those received from others). */
  isLocal: (origin: unknown) => boolean
  /** Everyone who edited since the last checkpoint, for the history. */
  authors: () => string[]
  onStatus: (status: PersistenceStatus) => void
  saveDelayMs?: number
  /** The state storage holds (or the seed of its text); anything beyond it is saved at once. */
  stored?: Uint8Array
}

/**
 * Keeps a Markdown live document's current state saved: 2 s after this tab's last edit, the text
 * and Yjs state go to storage on the known revision; when someone saved first, their state is
 * merged in (CRDT: no conflicts) and the save is retried. Adds checkpoints to the history (every
 * 5 minutes of activity, and once editing goes quiet for 2), and keeps the state in this browser.
 */
export function startPersistence(opts: Options): { flush: () => Promise<void>; stop: () => void } {
  const { route, doc, storage } = opts
  const delay = opts.saveDelayMs ?? SAVE_DELAY_MS
  let revision = opts.revision
  let timer: ReturnType<typeof setTimeout> | undefined
  let local: ReturnType<typeof setTimeout> | undefined
  let quiet: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let saving: Promise<void> | null = null
  let stopped = false
  let waitForEdit = false
  let retryMs = 0
  let lastEdit = 0
  let lastCheckpoint = Date.now()

  const schedule = (ms = delay) => {
    clearTimeout(timer)
    if (!stopped && !waitForEdit) timer = setTimeout(() => void save(), ms)
  }

  async function checkpoint(force: boolean) {
    const now = Date.now()
    if (!force && !checkpointDue(now, lastEdit, lastCheckpoint, lastEdit > lastCheckpoint)) return
    lastCheckpoint = now
    try {
      await checkpointNow(route, doc.getText(TEXT).toString(), opts.authors(), storage)
    } catch {
      // The history misses one point; the current state is saved either way.
    }
  }

  async function save(): Promise<void> {
    if (saving) return saving
    if (!dirty || stopped) return
    saving = (async () => {
      dirty = false
      opts.onStatus('saving')
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            revision = await saveCollabState(route, doc.getText(TEXT).toString(), Y.encodeStateAsUpdate(doc), revision, storage)
            retryMs = 0
            opts.onStatus('saved')
            void checkpoint(false)
            return
          } catch (error) {
            if (!(error instanceof LiveError) || error.kind !== 'stale') throw error
            // Someone saved first: take their state in (it only adds) and save on top of it.
            const latest = await openLive(route, storage)
            if (latest.state) Y.applyUpdate(doc, latest.state, 'storage')
            revision = latest.revision
          }
        }
        throw new LiveError('stale')
      } catch (error) {
        dirty = true
        const kind: LiveErrorKind = error instanceof LiveError ? error.kind : 'network'
        opts.onStatus(kind)
        if (kind === 'forbidden') stopped = true
        else if (kind === 'full' || kind === 'too-large') waitForEdit = true
        else {
          retryMs = Math.min(Math.max(retryMs * 2, RETRY_MIN_MS), RETRY_MAX_MS)
          schedule(retryMs)
        }
      } finally {
        saving = null
        // Edits typed while this save was on the wire go in the next one.
        if (dirty && !stopped && !waitForEdit && retryMs === 0) schedule()
      }
    })()
    return saving
  }

  const onUpdate = (_: Uint8Array, origin: unknown) => {
    clearTimeout(local)
    local = setTimeout(() => saveLocalState(route.id, doc), LOCAL_DELAY_MS)
    if (stopped || !opts.isLocal(origin) || origin === 'storage') return
    dirty = true
    waitForEdit = false
    lastEdit = Date.now()
    schedule()
    clearTimeout(quiet)
    quiet = setTimeout(() => void checkpoint(true), QUIET_AFTER_MS)
  }
  doc.on('update', onUpdate)
  if (opts.stored && aheadOf(doc, opts.stored)) {
    dirty = true
    schedule()
  }

  return {
    async flush() {
      clearTimeout(timer)
      await save()
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      clearTimeout(local)
      clearTimeout(quiet)
      doc.off('update', onUpdate)
      saveLocalState(route.id, doc)
    },
  }
}
