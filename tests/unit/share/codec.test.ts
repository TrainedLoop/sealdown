import { base64urlDecode, base64urlEncode } from '../../../src/share/base64url.ts'
import { compress, decompress } from '../../../src/share/codec.ts'
import { LinkError } from '../../../src/share/errors.ts'

const samples = ['', 'olá, ação ✓ 🎉', '# T\n```mermaid\ngraph TD; A-->B\n```', 'x'.repeat(2_000_000)]

test.each(samples.map((s, i) => [i, s]))('round trip #%i', async (_, s) => {
  expect(await decompress(base64urlDecode(base64urlEncode(await compress(s))))).toBe(s)
})

test('base64url alphabet and no padding', () => {
  expect(base64urlEncode(new Uint8Array([251, 255, 254]))).toBe('-__-')
  expect(base64urlEncode(new Uint8Array([1]))).toBe('AQ')
})

test('base64url round trip on large binary', () => {
  const bytes = new Uint8Array(300_000).map((_, i) => (i * 7) % 256)
  expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes)
})

test('invalid base64url throws corrupt', () => {
  expect(() => base64urlDecode('a*b')).toThrow(LinkError)
  expect(() => base64urlDecode('a+b')).toThrow(LinkError)
})

test('truncated compressed data throws corrupt', async () => {
  const bytes = await compress('hello world '.repeat(100))
  await expect(decompress(bytes.slice(0, bytes.length / 2))).rejects.toMatchObject({ kind: 'corrupt' })
})
