import { open, seal, signingKey, verifyingKey, type Envelope } from '../../../../src/live/collab/crypto.ts'
import { newWriteToken } from '../../../../src/live/links.ts'
import { newKey } from '../../../../src/share/crypto.ts'

const bytes = (...v: number[]) => new Uint8Array(v)

async function keys(token = newWriteToken()) {
  const signer = await signingKey(token)
  return { sign: signer.sign, verify: await verifyingKey(signer.publicKey), publicKey: signer.publicKey }
}

test('the signing key comes from the write token: same token, same public key', async () => {
  const token = newWriteToken()
  const a = await signingKey(token)
  const b = await signingKey(token)
  expect(a.publicKey).toHaveLength(32)
  expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey))
  expect(Array.from((await signingKey(newWriteToken())).publicKey)).not.toEqual(Array.from(a.publicKey))
})

test('signed envelopes round trip, for editors and readers alike', async () => {
  const key = newKey()
  const { sign, verify } = await keys()
  const env = await seal('update', 'tab-1', bytes(1, 2, 3), key, sign)
  expect(env).toMatchObject({ t: 'update', s: 'tab-1' })
  expect(env.m).toEqual(expect.any(String))
  // A reader has only the public key, and that is enough to check the signature.
  expect(Array.from((await open(env, key, verify))!)).toEqual([1, 2, 3])
})

test('content messages need a valid signature', async () => {
  const key = newKey()
  const { sign, verify } = await keys()
  const env = await seal('update', 'tab-1', bytes(9), key, sign)
  const tampered: Envelope = { ...env, d: env.d.slice(0, -4) + (env.d.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
  expect(await open(tampered, key, verify)).toBeNull()
  // Signed with another token's key (a forger who only has the read link).
  const forger = await keys()
  expect(await open(await seal('update', 'tab-2', bytes(9), key, forger.sign), key, verify)).toBeNull()
  for (const t of ['update', 'sync2', 'presence'] as const) {
    expect(await open(await seal(t, 'tab-3', bytes(9), key), key, verify)).toBeNull() // unsigned
  }
  // The type and the sender are signed too.
  expect(await open({ ...env, t: 'sync2' }, key, verify)).toBeNull()
  expect(await open({ ...env, s: 'someone-else' }, key, verify)).toBeNull()
  // Without a public key nothing with content is accepted.
  expect(await open(env, key, null)).toBeNull()
})

test('requests and announcements need no signature', async () => {
  const key = newKey()
  const env = await seal('sync1', 'reader', bytes(4), key)
  expect(env.m).toBeUndefined()
  expect(Array.from((await open(env, key, null))!)).toEqual([4])
  expect(Array.from((await open(await seal('saved', 'tab', bytes(5), key), key, null))!)).toEqual([5])
})

test('a wrong document key opens nothing', async () => {
  const { verify } = await keys()
  expect(await open(await seal('sync1', 'tab', bytes(1), newKey()), newKey(), verify)).toBeNull()
})
