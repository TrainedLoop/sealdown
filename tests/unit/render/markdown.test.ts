import { renderToDom } from './dom.ts'

test('mermaid fence becomes a placeholder with the exact source', () => {
  const source = 'graph TD\n  A["<b> & \\"q\\""] --> B'
  const root = renderToDom('```mermaid\n' + source + '\n```')
  const pre = root.querySelector('pre.mermaid-src')
  expect(pre).not.toBeNull()
  expect(pre!.textContent).toBe(source + '\n')
  expect(root.querySelector('b')).toBeNull()
})

test('inline math placeholder', () => {
  const el = renderToDom('Area $a^2$ here').querySelector('span.math-src')
  expect(el?.getAttribute('data-display')).toBe('false')
  expect(el?.textContent).toBe('a^2')
})

test('display math placeholder', () => {
  const el = renderToDom('$$\n\\int x\n$$').querySelector('div.math-src')
  expect(el?.getAttribute('data-display')).toBe('true')
  expect(el?.textContent?.trim()).toBe('\\int x')
})

test('math fence is display math', () => {
  expect(renderToDom('```math\nx^2\n```').querySelector('div.math-src[data-display="true"]')).not.toBeNull()
})

test('other fences keep their language class and are not highlighted yet', () => {
  const code = renderToDom('```ts\nconst a = 1 < 2\n```').querySelector('pre > code.language-ts')
  expect(code?.textContent).toBe('const a = 1 < 2\n')
  expect(code?.children).toHaveLength(0)
})

test('task list renders a checked, disabled checkbox', () => {
  const box = renderToDom('- [x] done\n- [ ] todo').querySelectorAll('input[type="checkbox"]')
  expect(box).toHaveLength(2)
  expect((box[0] as HTMLInputElement).checked).toBe(true)
  expect((box[0] as HTMLInputElement).disabled).toBe(true)
})

test('GFM table', () => {
  expect(renderToDom('| a | b |\n|---|---|\n| 1 | 2 |').querySelector('table td')?.textContent).toBe('1')
})

test('headings get ids, unique when repeated', () => {
  const root = renderToDom('# Olá Mundo\n\n## Same\n\n## Same')
  expect(root.querySelector('h1')?.id).toBeTruthy()
  const [a, b] = Array.from(root.querySelectorAll('h2')).map((h) => h.id)
  expect(a).toBeTruthy()
  expect(a).not.toBe(b)
  expect(root.querySelector('h1')?.textContent).toBe('Olá Mundo')
})

test('external links open in a new tab safely', () => {
  const a = renderToDom('[x](https://example.com)').querySelector('a')!
  expect(a.getAttribute('target')).toBe('_blank')
  expect(a.getAttribute('rel')).toBe('noopener noreferrer')
})

test('in-document anchor links are left alone', () => {
  const a = renderToDom('[x](#intro)').querySelector('a')!
  expect(a.getAttribute('href')).toBe('#intro')
  expect(a.hasAttribute('target')).toBe(false)
})

test('headings named after document properties keep an id', () => {
  const root = renderToDom('## Implementation\n\n## Images\n\n## Title')
  for (const h of root.querySelectorAll('h2')) expect(h.id).toMatch(/\S/)
})

test('links leaving the document open in a new tab, whatever their form', () => {
  const root = renderToDom('[a](//evil.example/x) [b](other.html) [c](/rendermd/)')
  for (const a of root.querySelectorAll('a')) {
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  }
})

test('emoji-only headings still get a usable, unique id', () => {
  const root = renderToDom('# 🎉\n\n# 🚀')
  const ids = Array.from(root.querySelectorAll('h1')).map((h) => h.id)
  for (const id of ids) expect(id).toMatch(/section/)
  expect(new Set(ids).size).toBe(2)
})

describe('callouts', () => {
  test.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])('%s renders as a titled box with an icon', (type) => {
    const root = renderToDom(`> [!${type}]\n> Be careful.`)
    const box = root.querySelector(`.markdown-alert-${type.toLowerCase()}`)
    expect(box).not.toBeNull()
    expect(box!.querySelector('.markdown-alert-title svg path')).not.toBeNull()
    expect(box!.textContent).toContain('Be careful.')
  })

  test('a plain quote stays a quote', () => {
    expect(renderToDom('> just a quote').querySelector('blockquote')).not.toBeNull()
  })
})
