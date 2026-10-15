import { createSupabaseStorage, StorageUnavailableError } from '../../../src/storage/storage.ts'

const config = { url: 'https://example.supabase.co', anonKey: 'pk' }

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond(url, init)
  }) as typeof fetch
  return { impl, calls }
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

test('save posts standard base64 to create_doc and returns the id', async () => {
  const { impl, calls } = fakeFetch(() => json('Ab3dE5gH9k'))
  const storage = createSupabaseStorage(config, impl)
  const id = await storage.save(new Uint8Array([251, 255, 254]))
  expect(id).toBe('Ab3dE5gH9k')
  expect(calls[0].url).toBe('https://example.supabase.co/rest/v1/rpc/create_doc')
  expect(calls[0].init.method).toBe('POST')
  expect(new Headers(calls[0].init.headers).get('apikey')).toBe('pk')
  expect(new Headers(calls[0].init.headers).get('content-profile')).toBe('sealdown')
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ content: '+//+' })
})

test('load posts doc_id to get_doc and decodes the bytes', async () => {
  const { impl, calls } = fakeFetch(() => json('+//+'))
  const bytes = await createSupabaseStorage(config, impl).load('Ab3dE5gH9k')
  expect(calls[0].url).toBe('https://example.supabase.co/rest/v1/rpc/get_doc')
  expect(new Headers(calls[0].init.headers).get('content-profile')).toBe('sealdown')
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ doc_id: 'Ab3dE5gH9k' })
  expect(Array.from(bytes!)).toEqual([251, 255, 254])
})

test('load returns null for a missing doc', async () => {
  const { impl } = fakeFetch(() => json(null))
  expect(await createSupabaseStorage(config, impl).load('missingid0')).toBeNull()
})

test.each([
  ['url', { anonKey: 'pk' }],
  ['anonKey', { url: 'https://example.supabase.co' }],
])('missing %s makes storage unavailable without calling fetch', async (_, partial) => {
  const { impl, calls } = fakeFetch(() => json('x'))
  const storage = createSupabaseStorage(partial, impl)
  await expect(storage.save(new Uint8Array([1]))).rejects.toBeInstanceOf(StorageUnavailableError)
  await expect(storage.load('Ab3dE5gH9k')).rejects.toBeInstanceOf(StorageUnavailableError)
  expect(calls).toHaveLength(0)
})

test('network failure is unavailable', async () => {
  const { impl } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))
  await expect(createSupabaseStorage(config, impl).load('Ab3dE5gH9k')).rejects.toBeInstanceOf(StorageUnavailableError)
})

test('non-2xx status is unavailable', async () => {
  const { impl } = fakeFetch(() => json({ message: 'paused' }, 503))
  await expect(createSupabaseStorage(config, impl).save(new Uint8Array([1]))).rejects.toBeInstanceOf(StorageUnavailableError)
})
