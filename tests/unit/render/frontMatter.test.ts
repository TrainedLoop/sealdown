import { parseFrontMatter } from '../../../src/render/frontMatter.ts'
import { documentTitle } from '../../../src/render/title.ts'
import { renderToDom } from './dom.ts'

test('parses keys, quoted values and lists', () => {
  expect(parseFrontMatter('title: A Field Guide\nauthor: "The Press"\ntags: [markdown, typography]\n')).toEqual([
    { key: 'title', value: 'A Field Guide' },
    { key: 'author', value: 'The Press' },
    { key: 'tags', value: ['markdown', 'typography'] },
  ])
})

test('keeps unparseable lines as raw text and skips comments', () => {
  expect(parseFrontMatter('# comment\nnot a pair\nok: yes')).toEqual([
    { key: null, value: 'not a pair' },
    { key: 'ok', value: 'yes' },
  ])
})

test('front matter renders as a metadata table, escaped', () => {
  const root = renderToDom('---\ntitle: Hello <b>x</b>\ntags: [a, b]\n---\n\n# Body')
  const table = root.querySelector('table.front-matter')
  expect(table).not.toBeNull()
  expect(table!.textContent).toContain('Hello <b>x</b>')
  expect(table!.querySelector('b')).toBeNull()
  expect(table!.textContent).toContain('a, b')
  expect(root.querySelector('h1')?.textContent).toBe('Body')
  expect(root.querySelector('hr')).toBeNull()
})

test('title comes from front matter, else the first heading', () => {
  expect(documentTitle('---\ntitle: From meta\n---\n# Heading')).toBe('From meta')
  expect(documentTitle('intro\n\n## **Second** level\n\n# Later')).toBe('Second level')
  expect(documentTitle('```\n# not a heading\n```\n\n# Real')).toBe('Real')
  expect(documentTitle('no headings here')).toBeNull()
})
