import { decodeDoc, encodeDoc, JSON_MARKER } from '../../../src/share/docType.ts'

test('markdown is never marked', () => {
  expect(encodeDoc({ type: 'markdown', text: '# a' })).toBe('# a')
})

test('json carries the marker', () => {
  expect(JSON_MARKER).toBe('\u0001json\n')
  expect(encodeDoc({ type: 'json', text: '{}' })).toBe('\u0001json\n{}')
})

test('decode round trip', () => {
  expect(decodeDoc('\u0001json\n{"a":1}')).toEqual({ type: 'json', text: '{"a":1}' })
  expect(decodeDoc(encodeDoc({ type: 'markdown', text: 'x' }))).toEqual({ type: 'markdown', text: 'x' })
})

test('anything without the full marker is markdown', () => {
  for (const text of ['# a', '\u0001jsonx', '\u0001json', '']) expect(decodeDoc(text)).toEqual({ type: 'markdown', text })
})
