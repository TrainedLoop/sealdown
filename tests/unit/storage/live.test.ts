import { createLiveStorage, LiveError } from '../../../src/storage/live.ts'

const config = { url: 'https://example.supabase.co', anonKey: 'pk' }

function fakeFetch(respond: (name: string, body: Record<string, unknown>) => Response) {
  const calls: { name: string; body: Record<string, unknown>; headers: Headers }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    const name = url.replace('https://example.supabase.co/rest/v1/rpc/', '')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    calls.push({ name, body, headers: new Headers(init.headers) })
    return respond(name, body)
  }) as typeof fetch
  return { impl, calls }
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const pgError = (code: string, details: string | null = null, status = 400) =>
  json({ code, details, hint: null, message: 'x' }, status)

const bytes = (...values: number[]) => new Uint8Array(values)

test('create sends base64 content, author and hash to create_live', async () => {
  const { impl, calls } = fakeFetch(() => json('Ab3dE5gH9k'))
  const id = await createLiveStorage(config, impl).create(bytes(251, 255, 254), bytes(1), 'aGFzaA==')
  expect(id).toBe('Ab3dE5gH9k')
  expect(calls[0].name).toBe('create_live')
  expect(calls[0].headers.get('content-profile')).toBe('sealdown')
  expect(calls[0].body).toEqual({ content: '+//+', author: 'AQ==', write_hash: 'aGFzaA==' })
})

test('latest decodes the newest version', async () => {
  const { impl, calls } = fakeFetch(() => json([{ version: 3, content: '+//+', author: 'AQ==', created_at: '2026-10-21T10:00:00Z' }]))
  const v = await createLiveStorage(config, impl).latest('Ab3dE5gH9k')
  expect(calls[0]).toMatchObject({ name: 'get_live', body: { doc_id: 'Ab3dE5gH9k' } })
  expect(v.version).toBe(3)
  expect(Array.from(v.content)).toEqual([251, 255, 254])
  expect(Array.from(v.author)).toEqual([1])
  expect(v.createdAt).toBe('2026-10-21T10:00:00Z')
})

test('a missing document is a missing error', async () => {
  const { impl } = fakeFetch((name) => json(name === 'live_head' ? null : []))
  const storage = createLiveStorage(config, impl)
  await expect(storage.latest('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'missing' })
  await expect(storage.head('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'missing' })
})

test('head, version and list', async () => {
  const { impl, calls } = fakeFetch((name) => {
    if (name === 'live_head') return json(7)
    if (name === 'get_live_version') return json([{ content: 'AA==', author: '', created_at: 't' }])
    return json([{ version: 2, author: 'AQ==', size_bytes: 10, created_at: 't2' }, { version: 1, author: '', size_bytes: 9, created_at: 't1' }])
  })
  const storage = createLiveStorage(config, impl)
  expect(await storage.head('Ab3dE5gH9k')).toBe(7)
  expect((await storage.version('Ab3dE5gH9k', 1)).version).toBe(1)
  expect(calls[1].body).toEqual({ doc_id: 'Ab3dE5gH9k', version: 1 })
  expect(await storage.list('Ab3dE5gH9k')).toEqual([
    { version: 2, author: bytes(1), sizeBytes: 10, createdAt: 't2' },
    { version: 1, author: bytes(), sizeBytes: 9, createdAt: 't1' },
  ])
})

test('save returns the new version number', async () => {
  const { impl, calls } = fakeFetch(() => json(4))
  expect(await createLiveStorage(config, impl).save('Ab3dE5gH9k', 'tok', 3, bytes(0), bytes())).toBe(4)
  expect(calls[0]).toMatchObject({ name: 'save_version', body: { doc_id: 'Ab3dE5gH9k', write_token: 'tok', base_version: 3, content: 'AA==', author: '' } })
})

test('database errors map to live error kinds', async () => {
  const cases: [Response, string, number?][] = [
    [pgError('42501', null, 403), 'forbidden'],
    [pgError('P0002', null, 404), 'missing'],
    [pgError('40001', '7', 409), 'stale', 7],
    [pgError('53100', null, 500), 'full'],
    [pgError('23514', null, 400), 'too-large'],
    [new Response('bad gateway', { status: 502 }), 'network'],
  ]
  for (const [response, kind, latest] of cases) {
    const { impl } = fakeFetch(() => response.clone())
    const error = await createLiveStorage(config, impl).save('Ab3dE5gH9k', 'tok', 1, bytes(0), bytes()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LiveError)
    expect(error).toMatchObject({ kind, ...(latest !== undefined && { latest }) })
  }
})

test('no configuration or no connection is a network error', async () => {
  await expect(createLiveStorage({}, fetch).head('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'network' })
  const failing = (async () => {
    throw new TypeError('offline')
  }) as typeof fetch
  await expect(createLiveStorage(config, failing).head('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'network' })
})
