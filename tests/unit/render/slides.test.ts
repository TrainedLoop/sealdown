import { renderMarkdown } from '../../../src/render/markdown.ts'
import { splitSlides } from '../../../src/render/slides.ts'

const slides = (markdown: string) => splitSlides(renderMarkdown(markdown))

test('top-level horizontal rules split slides', () => {
  const result = slides('# One\n\n---\n\n# Two\n\ntext\n\n---\n\n# Three')
  expect(result).toHaveLength(3)
  expect(result[1]).toContain('Two')
  expect(result[1]).toContain('text')
  expect(result.join('')).not.toContain('<hr')
})

test('--- inside a code block does not split', () => {
  const result = slides('# One\n\n```yaml\na: 1\n---\nb: 2\n```\n\n---\n\n# Two')
  expect(result).toHaveLength(2)
  expect(result[0]).toContain('---')
})

test('a document without rules is a single slide', () => {
  expect(slides('# Only\n\ntext')).toHaveLength(1)
})

test('empty slides are dropped', () => {
  expect(slides('---\n\n# One\n\n---\n\n---\n\n# Two\n\n---')).toHaveLength(2)
})
