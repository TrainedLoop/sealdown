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
