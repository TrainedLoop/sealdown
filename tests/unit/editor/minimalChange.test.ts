import { minimalChange } from '../../../src/editor/minimalChange.ts'

test('only the part that differs is replaced', () => {
  expect(minimalChange('one\ntwo\nthree', 'one\nTWO\nthree')).toEqual({ from: 4, to: 7, insert: 'TWO' })
  expect(minimalChange('abc', 'abXc')).toEqual({ from: 2, to: 2, insert: 'X' })
  expect(minimalChange('abc', 'ac')).toEqual({ from: 1, to: 2, insert: '' })
  expect(minimalChange('same', 'same')).toBeNull()
})

test('repeated characters do not make the change overlap itself', () => {
  expect(minimalChange('aaa', 'aaaa')).toEqual({ from: 3, to: 3, insert: 'a' })
  expect(minimalChange('', 'x')).toEqual({ from: 0, to: 0, insert: 'x' })
})
