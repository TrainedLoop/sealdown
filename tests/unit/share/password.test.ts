import { decryptWithPassword, encryptWithPassword, PBKDF2_ITERATIONS } from '../../../src/share/password.ts'

const data = new TextEncoder().encode('secret ✓')

test('uses the agreed key derivation cost', () => {
  expect(PBKDF2_ITERATIONS).toBe(600_000)
})

test('round trip', async () => {
  const bytes = await encryptWithPassword(data, 'correct horse')
  expect(Array.from(await decryptWithPassword(bytes, 'correct horse'))).toEqual(Array.from(data))
})

test('fresh salt and IV each time', async () => {
  const a = await encryptWithPassword(data, 'pw')
  const b = await encryptWithPassword(data, 'pw')
  expect(Array.from(a.slice(0, 16))).not.toEqual(Array.from(b.slice(0, 16)))
  expect(Array.from(a.slice(16, 28))).not.toEqual(Array.from(b.slice(16, 28)))
})

test('wrong password is reported as such', async () => {
  const bytes = await encryptWithPassword(data, 'right')
  await expect(decryptWithPassword(bytes, 'wrong')).rejects.toMatchObject({ kind: 'wrong-password' })
})

test('truncated bytes are corrupt', async () => {
  await expect(decryptWithPassword(new Uint8Array(20), 'pw')).rejects.toMatchObject({ kind: 'corrupt' })
})

test('accented passwords open regardless of how the OS composes them', async () => {
  const composed = 'café' // é as one code point (Windows, Linux)
  const decomposed = 'café' // e + combining accent (macOS)
  const bytes = await encryptWithPassword(data, decomposed)
  expect(Array.from(await decryptWithPassword(bytes, composed))).toEqual(Array.from(data))
})

test('links protected before normalization still open', async () => {
  // Before NFC normalization, the raw string derived the key; emulate such a link.
  const decomposed = 'café'
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(decomposed), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  const legacy = new Uint8Array([...salt, ...iv, ...ct])
  expect(Array.from(await decryptWithPassword(legacy, decomposed))).toEqual(Array.from(data))
})

test('a password and salt always derive the same raw key, which decrypts what it encrypted', async () => {
  const { deriveRawKey } = await import('../../../src/share/password.ts')
  const { decrypt, encryptWithKey } = await import('../../../src/share/crypto.ts')
  const salt = new Uint8Array(16).fill(7)
  const key = await deriveRawKey('café', salt)
  expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(await deriveRawKey('café', salt)).toBe(key) // NFC: the same password typed two ways
  expect(await deriveRawKey('other', salt)).not.toBe(key)
  const bytes = await encryptWithKey(new TextEncoder().encode('live'), key)
  expect(new TextDecoder().decode(await decrypt(bytes, key))).toBe('live')
}, 30_000)
