import { extractToc } from '../../../src/render/toc.ts'
import { renderToDom } from './dom.ts'

test('collects h1-h3 in order and ignores deeper headings', () => {
  const root = renderToDom('# One\n\n## Two\n\n#### Skip\n\n### Three')
  const toc = extractToc(root)
  expect(toc.map((e) => [e.level, e.text])).toEqual([
    [1, 'One'],
    [2, 'Two'],
    [3, 'Three'],
  ])
  for (const entry of toc) expect(root.querySelector(`#${CSS.escape(entry.id)}`)).not.toBeNull()
})
