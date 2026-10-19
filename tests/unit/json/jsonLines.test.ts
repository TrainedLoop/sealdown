import { jsonLines, lineOfPointer, pointerAtLine } from '../../../src/json/jsonLines.ts'

const text = `{
  "name": "Ada",
  "tags": [
    "x",
    { "a/b": 1, "c~d": null }
  ],
  "empty": {}
}`

test('records the line where each value starts, as JSON pointers', () => {
  expect(jsonLines(text)).toEqual([
    { pointer: '', line: 1 },
    { pointer: '/name', line: 2 },
    { pointer: '/tags', line: 3 },
    { pointer: '/tags/0', line: 4 },
    { pointer: '/tags/1', line: 5 },
    { pointer: '/tags/1/a~1b', line: 5 },
    { pointer: '/tags/1/c~0d', line: 5 },
    { pointer: '/empty', line: 7 },
  ])
})

test('strings with escapes, braces and newlines inside do not confuse it', () => {
  expect(jsonLines('{"a": "x\\"}{[", \n"b": 2}')).toEqual([
    { pointer: '', line: 1 },
    { pointer: '/a', line: 1 },
    { pointer: '/b', line: 2 },
  ])
})

test('invalid JSON yields what it read before the error', () => {
  expect(jsonLines('{\n"a": 1,\n"b": ')).toEqual([
    { pointer: '', line: 1 },
    { pointer: '/a', line: 2 },
  ])
})

test('the pointer shown at a line is the deepest value starting at or above it', () => {
  const lines = jsonLines(text)
  expect(pointerAtLine(lines, 1)).toBe('')
  expect(pointerAtLine(lines, 4)).toBe('/tags/0')
  expect(pointerAtLine(lines, 6)).toBe('/tags/1/c~0d')
  expect(pointerAtLine(lines, 99)).toBe('/empty')
  expect(pointerAtLine([], 3)).toBeNull()
})

test('the line of a pointer', () => {
  const lines = jsonLines(text)
  expect(lineOfPointer(lines, '/tags/1')).toBe(5)
  expect(lineOfPointer(lines, '/missing')).toBeNull()
})
