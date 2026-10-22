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

test('create sends base64 content, author, hash and optional salt and state to create_live', async () => {
  const { impl, calls } = fakeFetch(() => json('Ab3dE5gH9k'))
  const storage = createLiveStorage(config, impl)
  expect(await storage.create(bytes(251, 255, 254), bytes(1), 'aGFzaA==')).toBe('Ab3dE5gH9k')
  expect(calls[0].name).toBe('create_live')
  expect(calls[0].headers.get('content-profile')).toBe('sealdown')
  expect(calls[0].body).toEqual({ content: '+//+', author: 'AQ==', write_hash: 'aGFzaA==' })
  await storage.create(bytes(1), bytes(), 'aGFzaA==', bytes(90, 90, 90), bytes(7))
  expect(calls[1].body).toMatchObject({ salt: 'Wlpa', state: 'Bw==' })
})

test('state decodes the current state', async () => {
  const { impl, calls } = fakeFetch(() => json([{ revision: 3, content: '+//+', state: 'Bw==', state_at: '2026-10-22T10:00:00Z' }]))
  const current = await createLiveStorage(config, impl).state('Ab3dE5gH9k')
  expect(calls[0]).toMatchObject({ name: 'get_state', body: { doc_id: 'Ab3dE5gH9k' } })
  expect(current.revision).toBe(3)
  expect(Array.from(current.content)).toEqual([251, 255, 254])
  expect(Array.from(current.state!)).toEqual([7])
  expect(current.stateAt).toBe('2026-10-22T10:00:00Z')
})

test('a document without a Yjs state has state null', async () => {
  const { impl } = fakeFetch(() => json([{ revision: 1, content: 'AA==', state: null, state_at: 't' }]))
  expect((await createLiveStorage(config, impl).state('Ab3dE5gH9k')).state).toBeNull()
})

test('a missing document is a missing error', async () => {
  const { impl } = fakeFetch((name) => json(name === 'live_head' ? null : []))
  const storage = createLiveStorage(config, impl)
  await expect(storage.state('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'missing' })
  await expect(storage.head('Ab3dE5gH9k')).rejects.toMatchObject({ kind: 'missing' })
})

test('saveState sends the base revision, content and state; the token as standard base64', async () => {
  const { impl, calls } = fakeFetch(() => json(4))
  const storage = createLiveStorage(config, impl)
  expect(await storage.saveState('Ab3dE5gH9k', '-_8', 3, bytes(0), bytes(7))).toBe(4)
  expect(calls[0]).toMatchObject({ name: 'save_state', body: { doc_id: 'Ab3dE5gH9k', write_token: '+/8=', base_revision: 3, content: 'AA==', state: 'Bw==' } })
  await storage.saveState('Ab3dE5gH9k', 'AQ', 4, bytes(0), null)
  expect(calls[1].body.state).toBeNull()
})

test('checkpoint sends authors and an optional label', async () => {
  const { impl, calls } = fakeFetch(() => json(9))
  const storage = createLiveStorage(config, impl)
  expect(await storage.checkpoint('Ab3dE5gH9k', 'AQ', bytes(0), bytes(1))).toBe(9)
  expect(calls[0]).toMatchObject({ name: 'add_checkpoint', body: { content: 'AA==', authors: 'AQ==' } })
  expect(calls[0].body).not.toHaveProperty('label')
  await storage.checkpoint('Ab3dE5gH9k', 'AQ', bytes(0), bytes(1), bytes(2))
  expect(calls[1].body.label).toBe('Ag==')
})

test('head, version and list', async () => {
  const { impl, calls } = fakeFetch((name) => {
    if (name === 'live_head') return json(7)
    if (name === 'get_live_version') return json([{ content: 'AA==', author: '', label: 'Ag==', created_at: 't' }])
    return json([
      { version: 2, author: 'AQ==', label: null, size_bytes: 10, created_at: 't2' },
      { version: 1, author: '', label: 'Ag==', size_bytes: 9, created_at: 't1' },
    ])
  })
  const storage = createLiveStorage(config, impl)
  expect(await storage.head('Ab3dE5gH9k')).toBe(7)
  const v = await storage.version('Ab3dE5gH9k', 1)
  expect(v).toMatchObject({ version: 1, createdAt: 't' })
  expect(Array.from(v.label!)).toEqual([2])
  expect(calls[1].body).toEqual({ doc_id: 'Ab3dE5gH9k', version: 1 })
  expect(await storage.list('Ab3dE5gH9k')).toEqual([
    { version: 2, author: bytes(1), label: null, sizeBytes: 10, createdAt: 't2' },
    { version: 1, author: bytes(), label: bytes(2), sizeBytes: 9, createdAt: 't1' },
  ])
})

test('database errors map to live error kinds', async () => {
  const cases: [Response, string, number?][] = [
    [pgError('42501', null, 403), 'forbidden'],
    [pgError('P0002', null, 404), 'missing'],
    [pgError('PT409', '7', 409), 'stale', 7],
    [pgError('53100', null, 500), 'full'],
    [pgError('23514', null, 400), 'too-large'],
    [new Response('bad gateway', { status: 502 }), 'network'],
  ]
  for (const [response, kind, latest] of cases) {
    const { impl } = fakeFetch(() => response.clone())
    const error = await createLiveStorage(config, impl).saveState('Ab3dE5gH9k', 'AQ', 1, bytes(0), null).catch((e: unknown) => e)
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

test('salt: read back for a password-protected document, null otherwise', async () => {
  const salted = createLiveStorage(config, fakeFetch(() => json('Wlpa')).impl)
  expect(Array.from((await salted.salt('Ab3dE5gH9k'))!)).toEqual([90, 90, 90])
  const plain = createLiveStorage(config, fakeFetch(() => json(null)).impl)
  expect(await plain.salt('Ab3dE5gH9k')).toBeNull()
})
