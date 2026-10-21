import { mergeJson, mergeMarkdown, type MergeResult } from '../../../src/live/merge.ts'

function clean(result: MergeResult): string {
  if (!('text' in result)) throw new Error(`expected a clean merge, got ${JSON.stringify(result.conflicts)}`)
  return result.text
}

function conflicted(result: MergeResult) {
  if ('text' in result) throw new Error(`expected conflicts, got ${result.text}`)
  return result
}

describe('Markdown', () => {
  const base = '# Title\n\nalpha\nbeta\ngamma\n'

  test('edits to different lines both apply', () => {
    const mine = '# Title\n\nALPHA\nbeta\ngamma\n'
    const theirs = '# Title\n\nalpha\nbeta\nGAMMA\n'
    expect(clean(mergeMarkdown(base, mine, theirs))).toBe('# Title\n\nALPHA\nbeta\nGAMMA\n')
  })

  test('the same edit on both sides is not a conflict', () => {
    const both = '# Title\n\nalpha\nBETA\ngamma\n'
    expect(clean(mergeMarkdown(base, both, both))).toBe(both)
  })

  test('nothing changed on my side takes theirs', () => {
    const theirs = '# Other\n'
    expect(clean(mergeMarkdown(base, base, theirs))).toBe(theirs)
  })

  test('different edits to the same line conflict, and each choice resolves it', () => {
    const mine = '# Title\n\nalpha\nmine\ngamma\n'
    const theirs = '# Title\n\nalpha\ntheirs\ngamma\n'
    const result = conflicted(mergeMarkdown(base, mine, theirs))
    expect(result.conflicts).toEqual([{ id: 0, label: 'line 4', mine: 'mine', theirs: 'theirs' }])
    expect(result.resolve({ 0: 'mine' })).toBe(mine)
    expect(result.resolve({ 0: 'theirs' })).toBe(theirs)
    expect(result.resolve({ 0: 'both' })).toBe('# Title\n\nalpha\nmine\ntheirs\ngamma\n')
  })

  test('conflicts are numbered in document order with their line ranges', () => {
    const b = 'a\nb\nc\nd\ne\n'
    const result = conflicted(mergeMarkdown(b, 'A\nb\nc\nD1\nD2\ne\n', 'a2\nb\nc\nd2\ne\n'))
    expect(result.conflicts.map((c) => [c.id, c.label])).toEqual([
      [0, 'line 1'],
      [1, 'lines 4–5'],
    ])
  })
})

describe('JSON', () => {
  const base = '{\n  "a": 1,\n  "b": 2,\n  "list": [1, 2, 3]\n}'

  test('different keys changed on each side merge', () => {
    const mine = '{"a": 10, "b": 2, "list": [1, 2, 3]}'
    const theirs = '{"a": 1, "b": 20, "list": [1, 2, 3]}'
    expect(JSON.parse(clean(mergeJson(base, mine, theirs)))).toEqual({ a: 10, b: 20, list: [1, 2, 3] })
  })

  test('a merge of both sides is indented by two spaces', () => {
    expect(clean(mergeJson('{"a":1,"b":1}', '{"a":2,"b":1}', '{"a":1,"b":2}'))).toBe('{\n  "a": 2,\n  "b": 2\n}')
  })

  test('a key added on one side and another removed on the other both apply', () => {
    const mine = '{"a": 1, "b": 2, "list": [1, 2, 3], "c": 3}'
    const theirs = '{"b": 2, "list": [1, 2, 3]}'
    expect(JSON.parse(clean(mergeJson(base, mine, theirs)))).toEqual({ b: 2, list: [1, 2, 3], c: 3 })
  })

  test('arrays merge by index', () => {
    const mine = '{"a": 1, "b": 2, "list": [9, 2, 3]}'
    const theirs = '{"a": 1, "b": 2, "list": [1, 2, 7]}'
    expect(JSON.parse(clean(mergeJson(base, mine, theirs))).list).toEqual([9, 2, 7])
  })

  test('the same value set on both sides is not a conflict', () => {
    const both = '{"a": 5, "b": 2, "list": [1, 2, 3]}'
    expect(JSON.parse(clean(mergeJson(base, both, both))).a).toBe(5)
  })

  test('different values for one key conflict, labelled by pointer', () => {
    const result = conflicted(mergeJson(base, '{"a": 10, "b": 2, "list": [1, 2, 3]}', '{"a": 11, "b": 2, "list": [1, 2, 3]}'))
    expect(result.conflicts).toEqual([{ id: 0, label: '/a', mine: '10', theirs: '11' }])
    expect(JSON.parse(result.resolve({ 0: 'theirs' })).a).toBe(11)
    expect(JSON.parse(result.resolve({ 0: 'mine' })).a).toBe(10)
  })

  test('big numbers keep their digits', () => {
    const text = clean(mergeJson('{"id": 1, "n": 1}', '{"id": 12345678901234567890, "n": 1}', '{"id": 1, "n": 2}'))
    expect(text).toContain('12345678901234567890')
    expect(text).toContain('"n": 2')
  })

  test('invalid JSON on any side makes the whole document one conflict', () => {
    const result = conflicted(mergeJson(base, '{"a": ', base.replace('1', '5')))
    expect(result.conflicts).toEqual([{ id: 0, label: 'document', mine: '{"a": ', theirs: base.replace('1', '5') }])
    expect(result.resolve({ 0: 'mine' })).toBe('{"a": ')
  })
})

test('JSON changed on one side only keeps that side text exactly', () => {
  const theirs = '{"a":1,   "b":3}'
  expect(clean(mergeJson('{"a":1}', '{"a":1}', theirs))).toBe(theirs)
  expect(clean(mergeJson('{"a":1}', theirs, '{"a":1}'))).toBe(theirs)
})

test('arrays whose length changed on both sides are one conflict, not a per-index merge', () => {
  const result = conflicted(mergeJson('{"x": ["a","b","c"]}', '{"x": ["b","c"]}', '{"x": ["a","b"]}'))
  expect(result.conflicts.map((c) => c.label)).toEqual(['/x'])
  expect(JSON.parse(result.resolve({ 0: 'theirs' })).x).toEqual(['a', 'b'])
})

test('an item removed on one side and another edited on the other is a conflict', () => {
  const result = conflicted(mergeJson('["a","b","c"]', '["b","c"]', '["a","B","c"]'))
  expect(result.conflicts.map((c) => c.label)).toEqual(['/'])
})
