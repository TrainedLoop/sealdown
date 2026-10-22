import * as Y from 'yjs'
import { loadLocalState, saveLocalState, startPersistence } from '../../../../src/live/collab/persistence.ts'
import { seedUpdate, TEXT } from '../../../../src/live/collab/seed.ts'
import { writeHash } from '../../../../src/live/links.ts'
import { createLiveDoc, openLive } from '../../../../src/live/session.ts'
import { LiveError, type LiveStorage } from '../../../../src/storage/live.ts'

/** Enough of the server for the current state: token check and optimistic revision. */
function stateStorage(): LiveStorage & { saves: number } {
  type Row = { hash: string; revision: number; content: Uint8Array; state: Uint8Array | null; signKey: Uint8Array | null }
  const rows = new Map<string, Row>()
  let n = 0
  const row = (id: string) => {
    const r = rows.get(id)
    if (!r) throw new LiveError('missing')
    return r
  }
  const storage = {
    saves: 0,
    async create(content: Uint8Array, _a: Uint8Array, hash: string, _s?: Uint8Array, state?: Uint8Array, signKey?: Uint8Array) {
      const id = `doc${String(n++).padStart(7, '0')}`
      rows.set(id, { hash, revision: 1, content, state: state ?? null, signKey: signKey ?? null })
      return id
    },
    async state(id: string) {
      const r = row(id)
      return { revision: r.revision, content: r.content, state: r.state, stateAt: 'now', signKey: r.signKey }
    },
    async head(id: string) {
      return row(id).revision
    },
    async saveState(id: string, token: string, base: number, content: Uint8Array, state: Uint8Array | null) {
      const r = row(id)
      if ((await writeHash(token)) !== r.hash) throw new LiveError('forbidden')
      if (base !== r.revision) throw new LiveError('stale', { latest: r.revision })
      Object.assign(r, { revision: r.revision + 1, content, state })
      storage.saves++
      return r.revision
    },
    async checkpoint() {
      return 1
    },
    async version(): Promise<never> {
      throw new LiveError('missing')
    },
    async list() {
      return []
    },
    async salt() {
      return null
    },
  }
  return storage
}

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const REMOTE = Symbol('remote')

async function setup(text = 'start', opts: { stored?: (doc: Y.Doc) => void } = {}) {
  const storage = stateStorage()
  const { edit } = await createLiveDoc({ type: 'markdown', text }, 'Ana', storage)
  const doc = new Y.Doc()
  Y.applyUpdate(doc, seedUpdate(text), REMOTE)
  opts.stored?.(doc)
  const statuses: string[] = []
  const persistence = startPersistence({
    route: edit,
    doc,
    storage,
    revision: 1,
    isLocal: (origin) => origin !== REMOTE,
    authors: () => ['Ana'],
    onStatus: (s) => statuses.push(s),
    saveDelayMs: 10,
    stored: seedUpdate(text),
  })
  return { storage, edit, doc, persistence, statuses }
}

test('a local edit saves the text and the Yjs state as the current state', async () => {
  const { storage, edit, doc, persistence } = await setup()
  doc.getText(TEXT).insert(5, ' here')
  await until(() => storage.saves === 1)
  const opened = await openLive(edit, storage)
  expect(opened.revision).toBe(2)
  expect(opened.doc.text).toBe('start here')
  const fresh = new Y.Doc()
  Y.applyUpdate(fresh, opened.state!)
  expect(fresh.getText(TEXT).toString()).toBe('start here')
  persistence.stop()
})

test('edits that came from others are not saved by this browser', async () => {
  const { storage, doc, persistence } = await setup()
  doc.transact(() => doc.getText(TEXT).insert(0, 'remote '), REMOTE)
  await new Promise((r) => setTimeout(r, 80))
  expect(storage.saves).toBe(0)
  persistence.stop()
})

test('when someone else saved first, their state is merged in and the save goes on top', async () => {
  const { storage, edit, doc, persistence } = await setup('one')
  // Another browser saved revision 2 with its own edit.
  const other = new Y.Doc()
  Y.applyUpdate(other, seedUpdate('one'))
  other.getText(TEXT).insert(0, 'zero ')
  const { encryptWithKey } = await import('../../../../src/share/crypto.ts')
  const { compress } = await import('../../../../src/share/codec.ts')
  await storage.saveState(edit.id, edit.token, 1, await encryptWithKey(await compress('zero one'), edit.key), await encryptWithKey(Y.encodeStateAsUpdate(other), edit.key))
  doc.getText(TEXT).insert(3, ' two')
  await until(() => storage.saves === 2)
  expect(doc.getText(TEXT).toString()).toBe('zero one two')
  expect((await openLive(edit, storage)).doc.text).toBe('zero one two')
  persistence.stop()
})

test('a token that stopped working stops saving', async () => {
  const { edit, doc, persistence, statuses, storage } = await setup()
  ;(edit as { token: string }).token = 'A'.repeat(43)
  doc.getText(TEXT).insert(0, 'x')
  await until(() => statuses.includes('forbidden'))
  doc.getText(TEXT).insert(0, 'y')
  await new Promise((r) => setTimeout(r, 80))
  expect(storage.saves).toBe(0)
  persistence.stop()
})

test('the Yjs state is kept in the browser for reloads and offline work', () => {
  const doc = new Y.Doc()
  doc.getText(TEXT).insert(0, 'kept')
  saveLocalState('doc0000042', doc)
  const back = new Y.Doc()
  Y.applyUpdate(back, loadLocalState('doc0000042')!)
  expect(back.getText(TEXT).toString()).toBe('kept')
  expect(loadLocalState('missing000')).toBeNull()
})

test('an edit typed while a save is in flight is saved after it', async () => {
  const { storage, edit, doc, persistence } = await setup()
  const slow = storage.saveState.bind(storage)
  storage.saveState = async (...args) => {
    await new Promise((r) => setTimeout(r, 100))
    return slow(...args)
  }
  doc.getText(TEXT).insert(5, ' one')
  await new Promise((r) => setTimeout(r, 40)) // the first save is on the wire
  doc.getText(TEXT).insert(9, ' two')
  await until(() => storage.saves === 2)
  expect((await openLive(edit, storage)).doc.text).toBe('start one two')
  persistence.stop()
})

test('work this browser holds beyond the stored state is saved without a new edit', async () => {
  // Offline work merged in from localStorage before persistence started.
  const { storage, edit, persistence } = await setup('start', { stored: (doc) => doc.getText(TEXT).insert(5, ' offline') })
  await until(() => storage.saves === 1)
  expect((await openLive(edit, storage)).doc.text).toBe('start offline')
  persistence.stop()
})

test('two tabs keeping the state in one browser add to it rather than replace it', () => {
  const a = new Y.Doc()
  Y.applyUpdate(a, seedUpdate('base'))
  const b = new Y.Doc()
  Y.applyUpdate(b, seedUpdate('base'))
  a.getText(TEXT).insert(4, ' from a')
  b.getText(TEXT).insert(0, 'from b ')
  saveLocalState('tabs000042', a)
  saveLocalState('tabs000042', b)
  const back = new Y.Doc()
  Y.applyUpdate(back, loadLocalState('tabs000042')!)
  expect(back.getText(TEXT).toString()).toBe('from b base from a')
})
