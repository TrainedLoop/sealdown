import { parseRoute } from '../../../src/router/route.ts'
import { createLink, fetchProtected, openProtected, openRoute } from '../../../src/share/link.ts'
import { StorageUnavailableError, type DocStorage } from '../../../src/storage/storage.ts'

const baseUrl = 'https://trainedloop.github.io/sealdown/'

function memoryStorage() {
  const docs = new Map<string, Uint8Array>()
  let saves = 0
  const storage: DocStorage = {
    async save(bytes) {
      saves++
      const id = `Doc${String(docs.size).padStart(7, '0')}`
      docs.set(id, bytes)
      return id
    },
    async load(id) {
      return docs.get(id) ?? null
    },
  }
  return { storage, saves: () => saves }
}

const unavailable: DocStorage = {
  save: () => Promise.reject(new StorageUnavailableError()),
  load: () => Promise.reject(new StorageUnavailableError()),
}

function randomWords(bytes: number): string {
  const words: string[] = []
  let size = 0
  while (size < bytes) {
    const w = Math.random().toString(36).slice(2, 2 + 3 + Math.floor(Math.random() * 6))
    words.push(w)
    size += w.length + 1
  }
  return words.join(' ')
}

function randomChars(length: number): string {
  return Array.from({ length }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000))).join('')
}

async function open(url: string, storage: DocStorage) {
  const route = parseRoute(url.slice(url.indexOf('#')))
  if (route.kind !== 'inline' && route.kind !== 'inline-sealed' && route.kind !== 'stored') throw new Error(`unexpected route ${route.kind}`)
  return openRoute(route, storage)
}

test('short text stays in the URL, encrypted', async () => {
  const { storage, saves } = memoryStorage()
  const result = await createLink('# Hi ✓', { storage, baseUrl })
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok') return
  expect(result.url).toMatch(/#\/e\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
  expect(decodeURIComponent(result.url)).not.toContain('Hi')
  expect(saves()).toBe(0)
  expect(await open(result.url, storage)).toBe('# Hi ✓')
})

test('large text goes to storage', async () => {
  const { storage, saves } = memoryStorage()
  const text = randomWords(20_000)
  const result = await createLink(text, { storage, baseUrl })
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok') return
  expect(result.url).toMatch(/#\/s\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}$/)
  expect(saves()).toBe(1)
  expect(await open(result.url, storage)).toBe(text)
})

test('large text falls back to a long URL when storage is unavailable', async () => {
  const text = randomWords(20_000)
  const result = await createLink(text, { storage: unavailable, baseUrl })
  expect(result.kind).toBe('fallback')
  if (result.kind !== 'fallback') return
  expect(result.url).toContain('#/e/')
  expect(await open(result.url, unavailable)).toBe(text)
})

test('content over the stored cap is too large', async () => {
  const { storage, saves } = memoryStorage()
  const result = await createLink(randomChars(1_000_000), { storage, baseUrl })
  expect(result).toEqual({ kind: 'too-large' })
  expect(saves()).toBe(0)
})

test('missing stored doc is expired', async () => {
  const { storage } = memoryStorage()
  const key = 'A'.repeat(43)
  await expect(openRoute({ kind: 'stored', id: 'Missing000', key }, storage)).rejects.toMatchObject({ kind: 'expired' })
})

test('unavailable storage on open is a network error', async () => {
  await expect(openRoute({ kind: 'stored', id: 'Doc0000000', key: 'A'.repeat(43) }, unavailable)).rejects.toMatchObject({
    kind: 'network',
  })
})

test('wrong key is corrupt', async () => {
  const { storage } = memoryStorage()
  const result = await createLink(randomWords(20_000), { storage, baseUrl })
  if (result.kind !== 'ok') throw new Error('expected ok')
  const route = parseRoute(result.url.slice(result.url.indexOf('#')))
  if (route.kind !== 'stored') throw new Error('expected stored')
  const wrongKey = (route.key[0] === 'A' ? 'B' : 'A') + route.key.slice(1)
  await expect(openRoute({ ...route, key: wrongKey }, storage)).rejects.toMatchObject({ kind: 'corrupt' })
})

async function openWithPassword(url: string, storage: DocStorage, password: string) {
  const route = parseRoute(url.slice(url.indexOf('#')))
  if (route.kind !== 'inline-protected' && route.kind !== 'stored-protected') throw new Error(`unexpected route ${route.kind}`)
  return openProtected(await fetchProtected(route, storage), password)
}

test('short protected text stays in the URL and needs the password', async () => {
  const { storage, saves } = memoryStorage()
  const result = await createLink('# Secret ✓', { storage, baseUrl, password: 'pw' })
  if (result.kind !== 'ok') throw new Error('expected ok')
  expect(result.url).toMatch(/#\/p\/[A-Za-z0-9_-]+$/)
  expect(saves()).toBe(0)
  expect(await openWithPassword(result.url, storage, 'pw')).toBe('# Secret ✓')
  await expect(openWithPassword(result.url, storage, 'nope')).rejects.toMatchObject({ kind: 'wrong-password' })
})

test('large protected text is stored without a key in the link', async () => {
  const { storage, saves } = memoryStorage()
  const text = randomWords(20_000)
  const result = await createLink(text, { storage, baseUrl, password: 'pw' })
  if (result.kind !== 'ok') throw new Error('expected ok')
  expect(result.url).toMatch(/#\/q\/[A-Za-z0-9]{10}$/)
  expect(saves()).toBe(1)
  expect(await openWithPassword(result.url, storage, 'pw')).toBe(text)
})

test('large protected text falls back to a long protected link', async () => {
  const text = randomWords(20_000)
  const result = await createLink(text, { storage: unavailable, baseUrl, password: 'pw' })
  expect(result.kind).toBe('fallback')
  if (result.kind !== 'fallback') return
  expect(result.url).toContain('#/p/')
  expect(await openWithPassword(result.url, unavailable, 'pw')).toBe(text)
})

test('fetching a missing protected doc is expired', async () => {
  const { storage } = memoryStorage()
  await expect(fetchProtected({ kind: 'stored-protected', id: 'Missing000' }, storage)).rejects.toMatchObject({ kind: 'expired' })
  await expect(fetchProtected({ kind: 'stored-protected', id: 'Missing000' }, unavailable)).rejects.toMatchObject({ kind: 'network' })
})

test('a protected payload too short to hold salt and IV is corrupt', async () => {
  const { storage } = memoryStorage()
  await expect(fetchProtected({ kind: 'inline-protected', payload: 'AAAA' }, storage)).rejects.toMatchObject({ kind: 'corrupt' })
})

test('legacy plaintext #/v/ links still open', async () => {
  const { base64urlEncode } = await import('../../../src/share/base64url.ts')
  const { compress } = await import('../../../src/share/codec.ts')
  const { storage } = memoryStorage()
  const payload = base64urlEncode(await compress('# Old link'))
  expect(await openRoute({ kind: 'inline', payload }, storage)).toBe('# Old link')
})

test('a sealed inline link with the wrong key is corrupt', async () => {
  const { storage } = memoryStorage()
  const result = await createLink('# Small', { storage, baseUrl })
  if (result.kind !== 'ok') throw new Error('expected ok')
  const route = parseRoute(result.url.slice(result.url.indexOf('#')))
  if (route.kind !== 'inline-sealed') throw new Error('expected inline-sealed')
  const wrong = (route.key[0] === 'A' ? 'B' : 'A') + route.key.slice(1)
  await expect(openRoute({ ...route, key: wrong }, storage)).rejects.toMatchObject({ kind: 'corrupt' })
})
