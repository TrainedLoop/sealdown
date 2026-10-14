import { documentStats } from '../../../src/editor/stats.ts'

test('counts words, characters and lines', () => {
  expect(documentStats('one two three\nfour')).toEqual({ words: 4, chars: 18, lines: 2, minutes: 1 })
})

test('accented words and contractions count once', () => {
  expect(documentStats('ação é don’t well-known').words).toBe(4)
})

test('an empty document', () => {
  expect(documentStats('')).toEqual({ words: 0, chars: 0, lines: 0, minutes: 0 })
})

test('reading time at 200 words per minute, rounded up', () => {
  expect(documentStats('word '.repeat(201)).minutes).toBe(2)
})
