import { errorLine, findMermaidBlocks } from '../../../src/editor/mermaidLint.ts'

test('finds mermaid blocks with their offsets', () => {
  const doc = '# T\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```ts\nx\n```\n```mermaid\npie\n```\n'
  const blocks = findMermaidBlocks(doc)
  expect(blocks.map((b) => b.source)).toEqual(['graph TD\nA-->B', 'pie'])
  for (const b of blocks) {
    expect(doc.slice(b.bodyFrom, b.bodyFrom + b.source.length)).toBe(b.source)
    expect(doc.slice(b.from, b.from + 10)).toBe('```mermaid')
  }
})

test('ignores an unterminated fence', () => {
  expect(findMermaidBlocks('```mermaid\ngraph TD\nA-->')).toEqual([])
})

test('reads the error line from jison-style errors', () => {
  expect(errorLine({ hash: { loc: { first_line: 3 } } })).toBe(3)
  expect(errorLine({ hash: { line: 1 } })).toBe(2)
})

test('reads the error line from the message', () => {
  expect(errorLine(new Error('Parse error on line 4:\n...'))).toBe(4)
  expect(errorLine(new Error('Expecting token at line 2, column 5'))).toBe(2)
  expect(errorLine(new Error('No diagram type detected'))).toBeNull()
})
