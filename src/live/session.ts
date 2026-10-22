import { compress, decompress } from '../share/codec.ts'
import { decrypt, encryptWithKey, newKey } from '../share/crypto.ts'
import { decodeDoc, encodeDoc, type Doc, type DocType } from '../share/docType.ts'
import { deriveRawKey, newSalt } from '../share/password.ts'
import { LiveError, type LiveStorage } from '../storage/live.ts'
import { decryptAuthors, encryptAuthors } from './author.ts'
import { signingKey } from './collab/crypto.ts'
import { newWriteToken, readLinkOf, writeHash, type LiveEditRoute, type LiveReadRoute, type ProtectedLiveRoute } from './links.ts'
import type { LocalLive } from './localState.ts'
import { mergeJson, mergeMarkdown, type MergeResult } from './merge.ts'

// A live document's lifecycle in the browser: create, open, save the current state on a revision
// (merging with whatever was saved meanwhile, for JSON), and add checkpoints to its history.
// Everything sent to storage is encrypted with the link's key.

export type LiveRoute = LiveReadRoute | LiveEditRoute
/** The current state: the document, its revision and (Markdown) the decrypted Yjs state. */
/** `signKey` is the editors' public key (null for a document from before signatures). */
export type Opened = { doc: Doc; revision: number; state: Uint8Array | null; stateAt: string; signKey: Uint8Array | null }
export type Checkpoint = { doc: Doc; version: number; authors: string[]; label: string | null; createdAt: string }
export type Conflicted = Extract<MergeResult, { conflicts: unknown }>
export type Latest = { revision: number; text: string }
export type SaveOutcome =
  | { kind: 'saved'; revision: number; text: string; merged: boolean }
  | { kind: 'conflicts'; latest: Latest; merge: Conflicted }
export type UpdateOutcome =
  | { kind: 'updated'; local: LocalLive; stateAt: string }
  | { kind: 'conflicts'; latest: Latest; stateAt: string; merge: Conflicted }

// A few retries cover saves that keep landing right after someone else's.
const MAX_ATTEMPTS = 3

async function seal(doc: Doc, key: string): Promise<Uint8Array> {
  return encryptWithKey(await compress(encodeDoc(doc)), key)
}

async function unseal(bytes: Uint8Array, key: string): Promise<Doc> {
  return decodeDoc(await decompress(await decrypt(bytes, key)))
}

function merge(type: DocType, base: string, mine: string, theirs: string): MergeResult {
  return type === 'json' ? mergeJson(base, mine, theirs) : mergeMarkdown(base, mine, theirs)
}

async function create(doc: Doc, author: string, key: string, storage: LiveStorage, salt?: Uint8Array, state?: Uint8Array) {
  const token = newWriteToken()
  const id = await storage.create(
    await seal(doc, key),
    await encryptAuthors(author ? [author] : [], key),
    await writeHash(token),
    salt,
    state && (await encryptWithKey(state, key)),
    (await signingKey(token)).publicKey,
  )
  return { id, token }
}

/** `state` is the initial Yjs state of a Markdown document (stored encrypted). */
export async function createLiveDoc(doc: Doc, author: string, storage: LiveStorage, state?: Uint8Array): Promise<{ edit: LiveEditRoute; read: LiveReadRoute }> {
  const key = newKey()
  const { id, token } = await create(doc, author, key, storage, undefined, state)
  const edit: LiveEditRoute = { kind: 'live-edit', id, key, token }
  return { edit, read: readLinkOf(edit) }
}

/** Like createLiveDoc, but the key comes from `password`: neither link carries it. */
export async function createProtectedLiveDoc(doc: Doc, author: string, password: string, storage: LiveStorage, state?: Uint8Array) {
  const salt = newSalt()
  const key = await deriveRawKey(password, salt)
  const { id, token } = await create(doc, author, key, storage, salt, state)
  return {
    key,
    edit: { kind: 'live-edit-protected', id, token } as Extract<ProtectedLiveRoute, { kind: 'live-edit-protected' }>,
    read: { kind: 'live-read-protected', id } as Extract<ProtectedLiveRoute, { kind: 'live-read-protected' }>,
  }
}

/**
 * Derives the key of a password-protected document and opens it; null for a wrong password.
 * The key is what the rest of a live document's life uses, as if it had come from the link.
 */
export async function unlockLive(route: ProtectedLiveRoute, password: string, storage: LiveStorage): Promise<{ key: string; opened: Opened } | null> {
  const salt = await storage.salt(route.id)
  if (!salt) throw new LiveError('missing')
  const key = await deriveRawKey(password, salt)
  try {
    return { key, opened: await openLive({ kind: 'live-read', id: route.id, key }, storage) }
  } catch (error) {
    if (error instanceof LiveError) throw error
    return null // the key doesn't open it: wrong password
  }
}

export async function openLive(route: LiveRoute, storage: LiveStorage): Promise<Opened> {
  const current = await storage.state(route.id)
  return {
    doc: await unseal(current.content, route.key),
    revision: current.revision,
    state: current.state && (await decrypt(current.state, route.key)),
    stateAt: current.stateAt,
    signKey: current.signKey,
  }
}

export async function openVersion(route: LiveRoute, version: number, storage: LiveStorage): Promise<Checkpoint> {
  const v = await storage.version(route.id, version)
  return {
    doc: await unseal(v.content, route.key),
    version,
    authors: await decryptAuthors(v.author, route.key),
    label: v.label && (await decryptLabel(v.label, route.key)),
    createdAt: v.createdAt,
  }
}

async function decryptLabel(bytes: Uint8Array, key: string): Promise<string | null> {
  try {
    return new TextDecoder().decode(await decrypt(bytes, key))
  } catch {
    return null
  }
}

export async function listVersions(route: LiveRoute, storage: LiveStorage) {
  const rows = await storage.list(route.id)
  return Promise.all(
    rows.map(async (row) => ({
      version: row.version,
      authors: await decryptAuthors(row.author, route.key),
      label: row.label && (await decryptLabel(row.label, route.key)),
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
    })),
  )
}

/** Adds `text` to the history with everyone who edited since the last checkpoint; `label` names it. */
export async function checkpointNow(route: LiveEditRoute, text: string, authors: string[], storage: LiveStorage, label?: string, type: DocType = 'markdown'): Promise<number> {
  return storage.checkpoint(
    route.id,
    route.token,
    await seal({ type, text }, route.key),
    await encryptAuthors(authors, route.key),
    label === undefined ? undefined : await encryptWithKey(new TextEncoder().encode(label), route.key),
  )
}

/** Saves `local.draft` as the current state on `local.base`; when someone saved meanwhile, merges and saves on top. */
export async function saveDraft(route: LiveEditRoute, local: LocalLive, type: DocType, storage: LiveStorage): Promise<SaveOutcome> {
  let { base, baseText, draft: text } = local
  let merged = false
  for (let attempt = 1; ; attempt++) {
    try {
      const revision = await storage.saveState(route.id, route.token, base, await seal({ type, text }, route.key), null)
      return { kind: 'saved', revision, text, merged }
    } catch (error) {
      if (!(error instanceof LiveError) || error.kind !== 'stale' || attempt >= MAX_ATTEMPTS) throw error
    }
    const latest = await openLive(route, storage)
    const result = merge(type, baseText, text, latest.doc.text)
    if (!('text' in result)) return { kind: 'conflicts', latest: { revision: latest.revision, text: latest.doc.text }, merge: result }
    base = latest.revision
    baseText = latest.doc.text
    text = result.text
    merged = true
  }
}

/** Saves the text the person settled on after a conflict, on top of the state it was resolved against. */
export function saveResolved(route: LiveEditRoute, latest: Latest, text: string, type: DocType, storage: LiveStorage): Promise<SaveOutcome> {
  return saveDraft(route, { base: latest.revision, baseText: latest.text, draft: text }, type, storage)
}

/**
 * What was typed after Save or Update was pressed (`before` → `now`), applied to the text that
 * came back (`incoming`). Null when the late typing overlaps the incoming change.
 */
export function carryOver(type: DocType, before: string, now: string, incoming: string): string | null {
  if (now === before) return incoming
  const result = merge(type, before, now, incoming)
  return 'text' in result ? result.text : null
}

/** Brings the current state into the local draft, keeping unsaved changes. */
export async function updateFromLatest(route: LiveRoute, local: LocalLive, type: DocType, storage: LiveStorage): Promise<UpdateOutcome> {
  const latest = await openLive(route, storage)
  const text = latest.doc.text
  const result = local.draft === local.baseText ? { text } : merge(type, local.baseText, local.draft, text)
  if (!('text' in result)) return { kind: 'conflicts', latest: { revision: latest.revision, text }, stateAt: latest.stateAt, merge: result }
  return { kind: 'updated', local: { base: latest.revision, baseText: text, draft: result.text }, stateAt: latest.stateAt }
}

/** Saves checkpoint `version`'s text as the current state (the history keeps everything). */
export async function restoreVersion(route: LiveEditRoute, version: number, local: LocalLive, type: DocType, storage: LiveStorage): Promise<SaveOutcome> {
  const old = await openVersion(route, version, storage)
  return saveDraft(route, { ...local, draft: old.doc.text }, type, storage)
}
