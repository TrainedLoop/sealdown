import { decryptAuthors, encryptAuthor, encryptAuthors, loadAuthor, saveAuthor } from '../../../src/live/author.ts'
import { readLinkOf, writeHash } from '../../../src/live/links.ts'
import { loadLocal, saveLocal } from '../../../src/live/localState.ts'
import {
  carryOver,
  checkpointNow,
  createLiveDoc,
  createProtectedLiveDoc,
  listVersions,
  openLive,
  openVersion,
  restoreVersion,
  saveDraft,
  saveResolved,
  unlockLive,
  updateFromLatest,
} from '../../../src/live/session.ts'
import { newKey } from '../../../src/share/crypto.ts'
import { LiveError, type LiveStorage, type LiveVersion } from '../../../src/storage/live.ts'

/** The server's rules (token, optimistic revision, checkpoints) in memory. */
function memoryStorage(): LiveStorage {
  type Row = { hash: string; salt: Uint8Array | null; signKey: Uint8Array | null; revision: number; content: Uint8Array; state: Uint8Array | null; versions: LiveVersion[] }
  const docs = new Map<string, Row>()
  let next = 0
  const doc = (id: string) => {
    const found = docs.get(id)
    if (!found) throw new LiveError('missing')
    return found
  }
  const allowed = async (row: Row, token: string) => {
    if ((await writeHash(token)) !== row.hash) throw new LiveError('forbidden')
  }
  return {
    async create(content, author, hash, salt, state, signKey) {
      const id = `doc${String(next++).padStart(7, '0')}`
      docs.set(id, { hash, salt: salt ?? null, signKey: signKey ?? null, revision: 1, content, state: state ?? null, versions: [{ version: 1, content, author, label: null, createdAt: 't1' }] })
      return id
    },
    async state(id) {
      const row = doc(id)
      return { revision: row.revision, content: row.content, state: row.state, stateAt: `r${row.revision}`, signKey: row.signKey }
    },
    async head(id) {
      return doc(id).revision
    },
    async saveState(id, token, base, content, state) {
      const row = doc(id)
      await allowed(row, token)
      if (base !== row.revision) throw new LiveError('stale', { latest: row.revision })
      Object.assign(row, { revision: row.revision + 1, content, state })
      return row.revision
    },
    async checkpoint(id, token, content, author, label) {
      const row = doc(id)
      await allowed(row, token)
      const version = row.versions.at(-1)!.version + 1
      row.versions.push({ version, content, author, label: label ?? null, createdAt: `t${version}` })
      return version
    },
    async version(id, n) {
      const found = doc(id).versions.find((v) => v.version === n)
      if (!found) throw new LiveError('missing')
      return found
    },
    async list(id) {
      return doc(id)
        .versions.map((v) => ({ version: v.version, author: v.author, label: v.label, sizeBytes: v.content.length, createdAt: v.createdAt }))
        .reverse()
    },
    async salt(id) {
      return doc(id).salt
    },
  }
}

const base = '# Notes\n\none\ntwo\nthree\n'

async function start(storage: LiveStorage, text = base, type: 'markdown' | 'json' = 'json') {
  const { edit } = await createLiveDoc({ type, text }, 'Ana', storage)
  return { edit, local: { base: 1, baseText: text, draft: text } }
}

test('a created document opens from both links at revision 1, with no Yjs state yet', async () => {
  const storage = memoryStorage()
  const { edit, read } = await createLiveDoc({ type: 'json', text: '{"a":1}' }, 'Ana', storage)
  expect(read).toEqual(readLinkOf(edit))
  expect(await openLive(read, storage)).toMatchObject({ doc: { type: 'json', text: '{"a":1}' }, revision: 1, state: null })
})

test('a new document stores the editors\' public signing key, derived from the write token', async () => {
  const { signingKey } = await import('../../../src/live/collab/crypto.ts')
  const storage = memoryStorage()
  const { edit } = await createLiveDoc({ type: 'markdown', text: 'x' }, 'Ana', storage)
  const opened = await openLive(edit, storage)
  expect(Array.from(opened.signKey!)).toEqual(Array.from((await signingKey(edit.token)).publicKey))
})

test('a Yjs state given at creation comes back decrypted', async () => {
  const storage = memoryStorage()
  const { edit } = await createLiveDoc({ type: 'markdown', text: 'x' }, 'Ana', storage, new Uint8Array([1, 2, 3]))
  expect(Array.from((await openLive(edit, storage)).state!)).toEqual([1, 2, 3])
})

test('saving on the current revision moves it on', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  const outcome = await saveDraft(edit, { ...local, draft: base + 'four\n' }, 'json', storage)
  expect(outcome).toEqual({ kind: 'saved', revision: 2, text: base + 'four\n', merged: false })
  expect(await openLive(edit, storage)).toMatchObject({ revision: 2, doc: { text: base + 'four\n' } })
})

test('a stale save with separate changes merges and saves on top', async () => {
  const storage = memoryStorage()
  const text = '{"a": 1, "b": 1}'
  const { edit, local } = await start(storage, text)
  await saveDraft(edit, { ...local, draft: '{"a": 2, "b": 1}' }, 'json', storage)
  const outcome = await saveDraft(edit, { ...local, draft: '{"a": 1, "b": 3}' }, 'json', storage)
  expect(outcome).toMatchObject({ kind: 'saved', revision: 3, merged: true })
  expect(JSON.parse((await openLive(edit, storage)).doc.text)).toEqual({ a: 2, b: 3 })
})

test('a stale save touching the same value returns the conflicts, and the resolution saves', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage, '{"a": 1}')
  await saveDraft(edit, { ...local, draft: '{"a": 2}' }, 'json', storage)
  const outcome = await saveDraft(edit, { ...local, draft: '{"a": 3}' }, 'json', storage)
  if (outcome.kind !== 'conflicts') throw new Error('expected conflicts')
  expect(outcome.latest).toEqual({ revision: 2, text: '{"a": 2}' })
  const saved = await saveResolved(edit, outcome.latest, outcome.merge.resolve({ 0: 'theirs' }), 'json', storage)
  expect(saved).toMatchObject({ kind: 'saved', revision: 3 })
})

test('updating merges the latest state into an unsaved draft', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage, '{"a": 1, "b": 1}')
  await saveDraft(edit, { ...local, draft: '{"a": 2, "b": 1}' }, 'json', storage)
  const update = await updateFromLatest(edit, { ...local, draft: '{"a": 1, "b": 3}' }, 'json', storage)
  if (update.kind !== 'updated') throw new Error('expected an update')
  expect(update.local.base).toBe(2)
  expect(JSON.parse(update.local.draft)).toEqual({ a: 2, b: 3 })
})

test('checkpoints carry every author and an optional label; the list decrypts them', async () => {
  const storage = memoryStorage()
  const { edit } = await start(storage)
  await checkpointNow(edit, 'later', ['Ana', 'Bob'], storage)
  await checkpointNow(edit, 'named', ['Ana'], storage, 'Approved')
  const list = await listVersions(readLinkOf(edit), storage)
  expect(list.map((v) => [v.version, v.authors, v.label])).toEqual([
    [3, ['Ana'], 'Approved'],
    [2, ['Ana', 'Bob'], null],
    [1, ['Ana'], null],
  ])
  expect(await openVersion(readLinkOf(edit), 3, storage)).toMatchObject({ doc: { text: 'named' }, label: 'Approved', authors: ['Ana'] })
})

test('an author card from before lists one name', async () => {
  const key = newKey()
  expect(await decryptAuthors(await encryptAuthor('Ana', key), key)).toEqual(['Ana'])
  expect(await decryptAuthors(await encryptAuthors(['Ana', 'Bob'], key), key)).toEqual(['Ana', 'Bob'])
  expect(await decryptAuthors(new Uint8Array(), key)).toEqual([])
})

test('restoring saves an old checkpoint text as the current state', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: 'second\n' }, 'json', storage)
  const outcome = await restoreVersion(edit, 1, { base: 2, baseText: 'second\n', draft: 'second\n' }, 'json', storage)
  expect(outcome).toMatchObject({ kind: 'saved', revision: 3, text: base })
})

test('a wrong token cannot save', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await expect(saveDraft({ ...edit, token: 'A'.repeat(43) }, local, 'json', storage)).rejects.toMatchObject({ kind: 'forbidden' })
})

test('a password-protected document opens with the key derived from its password', async () => {
  const storage = memoryStorage()
  const { edit, read, key } = await createProtectedLiveDoc({ type: 'markdown', text: 'secret' }, 'Ana', 'pw', storage)
  expect(edit.kind).toBe('live-edit-protected')
  await expect(unlockLive(read, 'wrong', storage)).resolves.toBeNull()
  const unlocked = await unlockLive(read, 'pw', storage)
  expect(unlocked!.key).toBe(key)
  expect(unlocked!.opened.doc.text).toBe('secret')
}, 30_000)

test('local state and author name persist in the browser', () => {
  saveLocal('doc0000000', { base: 3, baseText: 'b', draft: 'd' })
  expect(loadLocal('doc0000000')).toEqual({ base: 3, baseText: 'b', draft: 'd' })
  expect(loadLocal('other00000')).toBeNull()
  expect(loadAuthor()).toBeNull()
  saveAuthor('Ana')
  expect(loadAuthor()).toBe('Ana')
})

test('text typed after a save or update is carried onto the new text', () => {
  expect(carryOver('markdown', 'X\n', 'X\nmore\n', 'Y\nX\n')).toBe('Y\nX\nmore\n')
  expect(carryOver('markdown', 'same\n', 'same\n', 'new\n')).toBe('new\n')
  expect(carryOver('markdown', 'a\n', 'b\n', 'c\n')).toBeNull()
})

test('a tab reload finds its own draft even when another tab saved meanwhile', () => {
  saveLocal('tabs000000', { base: 1, baseText: 'b', draft: 'tab B draft' })
  localStorage.setItem('sealdown.live.tabs000000', JSON.stringify({ base: 2, baseText: 'x', draft: 'x' }))
  expect(loadLocal('tabs000000')).toEqual({ base: 1, baseText: 'b', draft: 'tab B draft' })
})
