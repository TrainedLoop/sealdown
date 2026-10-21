import { decrypt, encrypt } from '../../../src/share/crypto.ts'

test('round trip', async () => {
  const data = new TextEncoder().encode('secret ✓')
  const { bytes, key } = await encrypt(data)
  expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(Array.from(await decrypt(bytes, key))).toEqual(Array.from(data))
})

test('fresh IV and key each time', async () => {
  const data = new Uint8Array([1, 2, 3])
  const a = await encrypt(data)
  const b = await encrypt(data)
  expect(a.key).not.toBe(b.key)
  expect(a.bytes.slice(0, 12)).not.toEqual(b.bytes.slice(0, 12))
})

test('wrong key fails', async () => {
  const { bytes } = await encrypt(new Uint8Array([1]))
  const { key: other } = await encrypt(new Uint8Array([1]))
  await expect(decrypt(bytes, other)).rejects.toMatchObject({ kind: 'corrupt' })
})

test('tampered bytes fail', async () => {
  const { bytes, key } = await encrypt(new Uint8Array([1, 2, 3]))
  bytes[bytes.length - 1] ^= 1
  await expect(decrypt(bytes, key)).rejects.toMatchObject({ kind: 'corrupt' })
})

test('malformed key fails', async () => {
  const { bytes } = await encrypt(new Uint8Array([1]))
  await expect(decrypt(bytes, 'short')).rejects.toMatchObject({ kind: 'corrupt' })
  await expect(decrypt(bytes, 'not*base64url')).rejects.toMatchObject({ kind: 'corrupt' })
})

test('too-short ciphertext fails', async () => {
  const { key } = await encrypt(new Uint8Array([1]))
  await expect(decrypt(new Uint8Array(5), key)).rejects.toMatchObject({ kind: 'corrupt' })
})

test('a fixed key encrypts what decrypt opens', async () => {
  const { newKey, encryptWithKey } = await import('../../../src/share/crypto.ts')
  const key = newKey()
  expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const data = new TextEncoder().encode('version ✓')
  const bytes = await encryptWithKey(data, key)
  expect(new TextDecoder().decode(await decrypt(bytes, key))).toBe('version ✓')
  expect(await encryptWithKey(data, key)).not.toEqual(bytes) // fresh IV each time
})
