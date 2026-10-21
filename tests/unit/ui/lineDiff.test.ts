import { lineDiff } from '../../../src/ui/lineDiff.ts'

test('unchanged lines are kept, removed and added lines marked in order', () => {
  expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
    { kind: 'same', text: 'a' },
    { kind: 'removed', text: 'b' },
    { kind: 'added', text: 'B' },
    { kind: 'same', text: 'c' },
    { kind: 'added', text: 'd' },
  ])
})

test('pure deletion and identical texts', () => {
  expect(lineDiff('a\nb', 'a')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }])
  expect(lineDiff('x', 'x')).toEqual([{ kind: 'same', text: 'x' }])
})
