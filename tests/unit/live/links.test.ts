import { newWriteToken, readLinkOf, writeHash } from '../../../src/live/links.ts'

test('write tokens are 16 random bytes in base64url', () => {
  const token = newWriteToken()
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
  expect(newWriteToken()).not.toBe(token)
})

test('the server gets the SHA-256 of the token, in standard base64', async () => {
  expect(await writeHash('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe('Zmh6rfhivXdsj8GLjp+OIAiXFIVu4jOzkCpZHQ1fKSU=')
})

test('the read link is the edit link without the token', () => {
  expect(readLinkOf({ kind: 'live-edit', id: 'Ab3dE5gH9k', key: 'k', token: 't' })).toEqual({ kind: 'live-read', id: 'Ab3dE5gH9k', key: 'k' })
})
