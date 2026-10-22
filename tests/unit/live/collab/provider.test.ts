import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { memoryHub, type Transport } from '../../../../src/live/collab/channel.ts'
import { seal, signingKey, verifyingKey } from '../../../../src/live/collab/crypto.ts'
import { CollabProvider } from '../../../../src/live/collab/provider.ts'
import { seedUpdate } from '../../../../src/live/collab/seed.ts'
import { newWriteToken } from '../../../../src/live/links.ts'
import { newKey } from '../../../../src/share/crypto.ts'

const key = newKey()
const token = newWriteToken()

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

async function keys() {
  const signer = await signingKey(token)
  return { sign: signer.sign, verify: await verifyingKey(signer.publicKey) }
}

const providers: CollabProvider[] = []
afterEach(() => {
  for (const p of providers.splice(0)) p.destroy()
})

async function peer(transport: Transport, opts: { editor?: boolean; doc?: Y.Doc } = {}) {
  const { sign, verify } = await keys()
  const doc = opts.doc ?? new Y.Doc()
  const awareness = new Awareness(doc)
  const provider = new CollabProvider({ doc, awareness, transport, key, sign: opts.editor === false ? null : sign, verify })
  providers.push(provider)
  return { doc, awareness, text: doc.getText('md'), provider }
}

test('two editors typing at the same spot converge', async () => {
  const hub = memoryHub()
  const a = await peer(hub.transport())
  const b = await peer(hub.transport())
  a.text.insert(0, 'hello ')
  b.text.insert(0, 'world ')
  await until(() => a.text.toString() === b.text.toString() && a.text.length === 12)
  expect(a.text.toString()).toBe(b.text.toString())
})

test('the same text seeded in two documents merges into one copy', () => {
  const one = new Y.Doc()
  const two = new Y.Doc()
  Y.applyUpdate(one, seedUpdate('# Plan\n'))
  Y.applyUpdate(two, seedUpdate('# Plan\n'))
  Y.applyUpdate(one, Y.encodeStateAsUpdate(two))
  Y.applyUpdate(two, Y.encodeStateAsUpdate(one))
  expect(one.getText('md').toString()).toBe('# Plan\n')
  expect(two.getText('md').toString()).toBe('# Plan\n')
})

test('a reader follows along, and what it sends is ignored', async () => {
  const hub = memoryHub()
  const editor = await peer(hub.transport())
  const reader = await peer(hub.transport(), { editor: false })
  editor.text.insert(0, 'from editor')
  await until(() => reader.text.toString() === 'from editor')
  // A local change on the reader goes nowhere (it can't sign), and a forged signed message is dropped.
  reader.text.insert(0, 'forged ')
  const forger = await signingKey(newWriteToken())
  const fake = new Y.Doc()
  fake.getText('md').insert(0, 'evil ')
  hub.transport().send(await seal('update', 'forger', Y.encodeStateAsUpdate(fake), key, forger.sign))
  await new Promise((r) => setTimeout(r, 300))
  expect(editor.text.toString()).toBe('from editor')
})

test('a late joiner gets everything from the others', async () => {
  const hub = memoryHub()
  const a = await peer(hub.transport())
  a.text.insert(0, 'written before you came')
  await new Promise((r) => setTimeout(r, 150))
  const late = await peer(hub.transport())
  await until(() => late.text.toString() === 'written before you came')
})

test('after going offline, a rejoin resyncs both ways', async () => {
  const hub = memoryHub()
  const ta = hub.transport()
  const a = await peer(ta)
  const b = await peer(hub.transport())
  hub.setOnline(ta, false)
  a.text.insert(0, 'offline edit ')
  b.text.insert(0, 'online edit ')
  await new Promise((r) => setTimeout(r, 200))
  expect(a.text.toString()).toBe('offline edit ')
  hub.setOnline(ta, true)
  await until(() => a.text.toString() === b.text.toString() && a.text.length === 'offline edit online edit '.length)
})

test('a late joiner with no one else online keeps what it loaded', async () => {
  const hub = memoryHub()
  const doc = new Y.Doc()
  Y.applyUpdate(doc, seedUpdate('stored text'))
  const alone = await peer(hub.transport(), { doc })
  await new Promise((r) => setTimeout(r, 200))
  expect(alone.text.toString()).toBe('stored text')
})

test('presence reaches the others: name, colour and cursor', async () => {
  const hub = memoryHub()
  const a = await peer(hub.transport())
  const b = await peer(hub.transport())
  a.awareness.setLocalStateField('user', { name: 'Ana', color: '#2dd4a7' })
  await until(() => [...b.awareness.getStates().values()].some((s) => (s as { user?: { name: string } }).user?.name === 'Ana'))
})

test('connection status is reported', async () => {
  const hub = memoryHub()
  const t = hub.transport()
  const a = await peer(t)
  expect(a.provider.status).toBe('connected')
  hub.setOnline(t, false)
  expect(a.provider.status).toBe('offline')
})
