import { renderMarkdown } from '../../../src/render/markdown.ts'
import { syncTarget } from '../../../src/render/scrollSync.ts'

function container(markdown: string) {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown)
  return root
}

test('block elements carry their 1-based source line', () => {
  const root = container('# Title\n\ntext\n\n- a\n- b\n\n```ts\ncode\n```\n\n---\n')
  expect(root.querySelector('h1')?.getAttribute('data-source-line')).toBe('1')
  expect(root.querySelector('p')?.getAttribute('data-source-line')).toBe('3')
  expect(root.querySelector('ul')?.getAttribute('data-source-line')).toBe('5')
  expect(root.querySelector('pre')?.getAttribute('data-source-line')).toBe('8')
  expect(root.querySelector('hr')?.getAttribute('data-source-line')).toBe('12')
})

test('mermaid placeholders carry their source line too', () => {
  const root = container('intro\n\n```mermaid\ngraph TD\n```\n')
  expect(root.querySelector('pre.mermaid-src')?.getAttribute('data-source-line')).toBe('3')
})

test('the target is the last block starting at or before the line', () => {
  const root = container('# One\n\npara\n\n```ts\n1\n2\n3\n4\n```\n\n## Two\n')
  expect(syncTarget(root, 1)?.tagName).toBe('H1')
  expect(syncTarget(root, 2)?.tagName).toBe('H1')
  expect(syncTarget(root, 7)?.tagName).toBe('PRE')
  expect(syncTarget(root, 12)?.tagName).toBe('H2')
  expect(syncTarget(root, 99)?.tagName).toBe('H2')
})

test('no target before the first block', () => {
  const root = container('\n\n\n# Late')
  expect(syncTarget(root, 1)).toBeNull()
})
