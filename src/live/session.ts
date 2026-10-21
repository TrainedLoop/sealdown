import { compress, decompress } from '../share/codec.ts'
import { decrypt, encryptWithKey, newKey } from '../share/crypto.ts'
import { decodeDoc, encodeDoc, type Doc, type DocType } from '../share/docType.ts'
import { LiveError, type LiveStorage } from '../storage/live.ts'
import { decryptAuthor, encryptAuthor, writerId } from './author.ts'
import { newWriteToken, readLinkOf, writeHash, type LiveEditRoute, type LiveReadRoute } from './links.ts'
import type { LocalLive } from './localState.ts'
import { mergeJson, mergeMarkdown, type MergeResult } from './merge.ts'

// A live document's lifecycle in the browser: create, open, save on a base version, and merge
// with whatever was saved meanwhile. Everything sent to storage is encrypted with the link's key.

export type LiveRoute = LiveReadRoute | LiveEditRoute
export type Opened = { doc: Doc; version: number; author: string; createdAt: string }
export type Conflicted = Extract<MergeResult, { conflicts: unknown }>
export type Latest = { version: number; text: string }
export type SaveOutcome =
  | { kind: 'saved'; version: number; text: string; merged: boolean }
  | { kind: 'conflicts'; latest: Latest; merge: Conflicted }
export type UpdateOutcome =
  | { kind: 'updated'; local: LocalLive; author: string; createdAt: string }
  | { kind: 'conflicts'; latest: Latest; author: string; createdAt: string; merge: Conflicted }

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

export async function createLiveDoc(doc: Doc, author: string, storage: LiveStorage): Promise<{ edit: LiveEditRoute; read: LiveReadRoute }> {
  const key = newKey()
  const token = newWriteToken()
  const id = await storage.create(await seal(doc, key), await encryptAuthor(author, key), await writeHash(token))
  const edit: LiveEditRoute = { kind: 'live-edit', id, key, token }
  return { edit, read: readLinkOf(edit) }
}

export async function openLive(route: LiveRoute, storage: LiveStorage): Promise<Opened> {
  const v = await storage.latest(route.id)
  return { doc: await unseal(v.content, route.key), version: v.version, author: await decryptAuthor(v.author, route.key), createdAt: v.createdAt }
}

export async function openVersion(route: LiveRoute, version: number, storage: LiveStorage): Promise<Opened> {
  const v = await storage.version(route.id, version)
  return { doc: await unseal(v.content, route.key), version, author: await decryptAuthor(v.author, route.key), createdAt: v.createdAt }
}

export async function listVersions(route: LiveRoute, storage: LiveStorage) {
  const rows = await storage.list(route.id)
  return Promise.all(rows.map(async (row) => ({ ...row, author: await decryptAuthor(row.author, route.key) })))
}

/** Saves `local.draft` on `local.base`; when someone saved meanwhile, merges and saves on top. */
export async function saveDraft(route: LiveEditRoute, local: LocalLive, type: DocType, author: string, storage: LiveStorage): Promise<SaveOutcome> {
  let { base, baseText, draft: text } = local
  let merged = false
  const card = await encryptAuthor(author, route.key)
  for (let attempt = 1; ; attempt++) {
    try {
      const version = await storage.save(route.id, route.token, base, await seal({ type, text }, route.key), card, writerId())
      return { kind: 'saved', version, text, merged }
    } catch (error) {
      if (!(error instanceof LiveError) || error.kind !== 'stale' || attempt >= MAX_ATTEMPTS) throw error
    }
    const latest = await openLive(route, storage)
    const result = merge(type, baseText, text, latest.doc.text)
    if (!('text' in result)) return { kind: 'conflicts', latest: { version: latest.version, text: latest.doc.text }, merge: result }
    base = latest.version
    baseText = latest.doc.text
    text = result.text
    merged = true
  }
}

/** Saves the text the person settled on after a conflict, on top of the version it was resolved against. */
export function saveResolved(route: LiveEditRoute, latest: Latest, text: string, type: DocType, author: string, storage: LiveStorage): Promise<SaveOutcome> {
  return saveDraft(route, { base: latest.version, baseText: latest.text, draft: text }, type, author, storage)
}

/** Brings the latest saved version into the local draft, keeping unsaved changes. */
export async function updateFromLatest(route: LiveRoute, local: LocalLive, type: DocType, storage: LiveStorage): Promise<UpdateOutcome> {
  const latest = await openLive(route, storage)
  const text = latest.doc.text
  const result = local.draft === local.baseText ? { text } : merge(type, local.baseText, local.draft, text)
  if (!('text' in result)) return { kind: 'conflicts', latest: { version: latest.version, text }, author: latest.author, createdAt: latest.createdAt, merge: result }
  return { kind: 'updated', local: { base: latest.version, baseText: text, draft: result.text }, author: latest.author, createdAt: latest.createdAt }
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

/** Saves version `version`'s text as the newest version (nothing is deleted). */
export async function restoreVersion(
  route: LiveEditRoute,
  version: number,
  local: LocalLive,
  type: DocType,
  author: string,
  storage: LiveStorage,
): Promise<SaveOutcome> {
  const old = await openVersion(route, version, storage)
  return saveDraft(route, { ...local, draft: old.doc.text }, type, author, storage)
}
