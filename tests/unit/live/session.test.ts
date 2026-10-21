import { readLinkOf, writeHash } from '../../../src/live/links.ts'
import { loadLocal, saveLocal } from '../../../src/live/localState.ts'
import { loadAuthor, saveAuthor } from '../../../src/live/author.ts'
import {
  createLiveDoc,
  listVersions,
  openLive,
  openVersion,
  restoreVersion,
  saveDraft,
  saveResolved,
  updateFromLatest,
} from '../../../src/live/session.ts'
import { LiveError, type LiveStorage, type LiveVersion } from '../../../src/storage/live.ts'

/** The server's rules (token, optimistic base, history) in memory. */
function memoryStorage(): LiveStorage & { saves: number } {
  const docs = new Map<string, { hash: string; versions: LiveVersion[] }>()
  let next = 0
  const doc = (id: string) => {
    const found = docs.get(id)
    if (!found) throw new LiveError('missing')
    return found
  }
  const storage = {
    saves: 0,
    async create(content: Uint8Array, author: Uint8Array, hash: string) {
      const id = `doc${String(next++).padStart(7, '0')}`
      docs.set(id, { hash, versions: [{ version: 1, content, author, createdAt: 't1' }] })
      return id
    },
    async latest(id: string) {
      return doc(id).versions.at(-1)!
    },
    async head(id: string) {
      return doc(id).versions.at(-1)!.version
    },
    async version(id: string, n: number) {
      const found = doc(id).versions.find((v) => v.version === n)
      if (!found) throw new LiveError('missing')
      return found
    },
    async list(id: string) {
      return doc(id)
        .versions.map((v) => ({ version: v.version, author: v.author, sizeBytes: v.content.length, createdAt: v.createdAt }))
        .reverse()
    },
    async save(id: string, token: string, base: number, content: Uint8Array, author: Uint8Array) {
      const d = doc(id)
      if ((await writeHash(token)) !== d.hash) throw new LiveError('forbidden')
      const latest = d.versions.at(-1)!.version
      if (base !== latest) throw new LiveError('stale', { latest })
      d.versions.push({ version: latest + 1, content, author, createdAt: `t${latest + 1}` })
      storage.saves++
      return latest + 1
    },
  }
  return storage
}

const base = '# Notes\n\none\ntwo\nthree\n'

async function start(storage: LiveStorage, text = base, type: 'markdown' | 'json' = 'markdown') {
  const { edit } = await createLiveDoc({ type, text }, 'Ana', storage)
  return { edit, local: { base: 1, baseText: text, draft: text } }
}

test('a created document opens from both links, type and author included', async () => {
  const storage = memoryStorage()
  const { edit, read } = await createLiveDoc({ type: 'json', text: '{"a":1}' }, 'Ana', storage)
  expect(edit.kind).toBe('live-edit')
  expect(read).toEqual(readLinkOf(edit))
  const opened = await openLive(read, storage)
  expect(opened).toMatchObject({ doc: { type: 'json', text: '{"a":1}' }, version: 1, author: 'Ana' })
})

test('saving on the current base creates the next version', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  const outcome = await saveDraft(edit, { ...local, draft: base + 'four\n' }, 'markdown', 'Bob', storage)
  expect(outcome).toEqual({ kind: 'saved', version: 2, text: base + 'four\n', merged: false })
  expect(await openLive(edit, storage)).toMatchObject({ version: 2, author: 'Bob', doc: { text: base + 'four\n' } })
})

test('a stale save with separate changes merges and saves on top', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: base.replace('one', 'ONE') }, 'markdown', 'Ana', storage)
  const outcome = await saveDraft(edit, { ...local, draft: base.replace('three', 'THREE') }, 'markdown', 'Bob', storage)
  expect(outcome).toEqual({ kind: 'saved', version: 3, text: '# Notes\n\nONE\ntwo\nTHREE\n', merged: true })
})

test('a stale save touching the same line returns the conflicts, and the resolution saves', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: base.replace('two', 'ana') }, 'markdown', 'Ana', storage)
  const outcome = await saveDraft(edit, { ...local, draft: base.replace('two', 'bob') }, 'markdown', 'Bob', storage)
  if (outcome.kind !== 'conflicts') throw new Error('expected conflicts')
  expect(outcome.latest).toEqual({ version: 2, text: base.replace('two', 'ana') })
  expect(outcome.merge.conflicts).toHaveLength(1)
  const resolved = outcome.merge.resolve({ 0: 'both' })
  const saved = await saveResolved(edit, outcome.latest, resolved, 'markdown', 'Bob', storage)
  expect(saved).toMatchObject({ kind: 'saved', version: 3, text: '# Notes\n\none\nbob\nana\nthree\n' })
})

test('JSON documents merge by path', async () => {
  const storage = memoryStorage()
  const text = '{"a": 1, "b": 1}'
  const { edit, local } = await start(storage, text, 'json')
  await saveDraft(edit, { ...local, draft: '{"a": 2, "b": 1}' }, 'json', 'Ana', storage)
  const outcome = await saveDraft(edit, { ...local, draft: '{"a": 1, "b": 3}' }, 'json', 'Bob', storage)
  expect(outcome.kind).toBe('saved')
  expect(JSON.parse((await openLive(edit, storage)).doc.text)).toEqual({ a: 2, b: 3 })
})

test('updating merges the latest version into an unsaved draft', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: base.replace('one', 'ONE') }, 'markdown', 'Ana', storage)
  const update = await updateFromLatest(edit, { ...local, draft: base.replace('three', 'THREE') }, 'markdown', storage)
  expect(update).toEqual({
    kind: 'updated',
    local: { base: 2, baseText: base.replace('one', 'ONE'), draft: '# Notes\n\nONE\ntwo\nTHREE\n' },
    author: 'Ana',
    createdAt: 't2',
  })
})

test('updating with no unsaved changes just takes the latest', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: 'new\n' }, 'markdown', 'Ana', storage)
  const update = await updateFromLatest(edit, local, 'markdown', storage)
  expect(update).toMatchObject({ kind: 'updated', local: { base: 2, baseText: 'new\n', draft: 'new\n' } })
})

test('updating into a conflicting draft returns the conflicts', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: base.replace('two', 'ana') }, 'markdown', 'Ana', storage)
  const update = await updateFromLatest(edit, { ...local, draft: base.replace('two', 'bob') }, 'markdown', storage)
  expect(update.kind).toBe('conflicts')
})

test('restoring saves an old version as the newest', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: 'second\n' }, 'markdown', 'Ana', storage)
  const outcome = await restoreVersion(edit, 1, { base: 2, baseText: 'second\n', draft: 'second\n' }, 'markdown', 'Bob', storage)
  expect(outcome).toMatchObject({ kind: 'saved', version: 3, text: base })
  expect((await openVersion(readLinkOf(edit), 2, storage)).doc.text).toBe('second\n')
})

test('the version list carries decrypted authors', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await saveDraft(edit, { ...local, draft: 'x\n' }, 'markdown', 'Bob', storage)
  expect((await listVersions(readLinkOf(edit), storage)).map((v) => [v.version, v.author])).toEqual([
    [2, 'Bob'],
    [1, 'Ana'],
  ])
})

test('a wrong token cannot save', async () => {
  const storage = memoryStorage()
  const { edit, local } = await start(storage)
  await expect(saveDraft({ ...edit, token: 'A'.repeat(43) }, local, 'markdown', 'Eve', storage)).rejects.toMatchObject({ kind: 'forbidden' })
})

test('local state and author name persist in the browser', () => {
  saveLocal('doc0000000', { base: 3, baseText: 'b', draft: 'd' })
  expect(loadLocal('doc0000000')).toEqual({ base: 3, baseText: 'b', draft: 'd' })
  expect(loadLocal('other00000')).toBeNull()
  expect(loadAuthor()).toBeNull()
  saveAuthor('Ana')
  expect(loadAuthor()).toBe('Ana')
})

test('text typed after Save or Update is carried onto the new text', async () => {
  const { carryOver } = await import('../../../src/live/session.ts')
  // Clicked with "X\n", kept typing "X\nmore\n"; the merged save brought in "Y".
  expect(carryOver('markdown', 'X\n', 'X\nmore\n', 'Y\nX\n')).toBe('Y\nX\nmore\n')
  expect(carryOver('markdown', 'same\n', 'same\n', 'new\n')).toBe('new\n')
  // The late typing overlaps the incoming change: nothing safe to apply.
  expect(carryOver('markdown', 'a\n', 'b\n', 'c\n')).toBeNull()
})

test('a tab reload finds its own draft even when another tab saved meanwhile', () => {
  saveLocal('tabs000000', { base: 1, baseText: 'b', draft: 'tab B draft' })
  // Another tab of the same browser writes the shared copy.
  localStorage.setItem('sealdown.live.tabs000000', JSON.stringify({ base: 2, baseText: 'x', draft: 'x' }))
  expect(loadLocal('tabs000000')).toEqual({ base: 1, baseText: 'b', draft: 'tab B draft' })
})

test('the writer id is random, stable per browser', async () => {
  const { writerId } = await import('../../../src/live/author.ts')
  const id = writerId()
  expect(id).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  expect(writerId()).toBe(id)
})
