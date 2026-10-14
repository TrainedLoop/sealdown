import { renderToDom } from './dom.ts'

const vectors = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[x](javascript:alert(1))',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<svg><script>alert(1)</script></svg>',
  '<svg onload=alert(1)>',
  '<iframe src="https://evil.example"></iframe>',
  '<object data="x"></object><embed src="x">',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<form action="https://evil.example"><input name="password"></form>',
]

test.each(vectors)('%s is neutralized', (input) => {
  const root = renderToDom(input)
  expect(root.querySelector('script, iframe, object, embed, form')).toBeNull()
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      expect(attr.name.startsWith('on')).toBe(false)
      if (attr.name === 'href' || attr.name === 'src' || attr.name === 'xlink:href') {
        expect(attr.value.trim().toLowerCase()).not.toMatch(/^(javascript|data:text\/html)/)
      }
    }
  }
})

test('safe inline HTML is kept', () => {
  expect(renderToDom('<details><summary>More</summary>Hidden</details>').querySelector('details summary')).not.toBeNull()
})

test('scripts inside a callout are still neutralized', () => {
  const root = renderToDom('> [!WARNING]\n> <img src=x onerror=alert(1)> <script>alert(1)</script>')
  expect(root.querySelector('.markdown-alert-warning')).not.toBeNull()
  expect(root.querySelector('script')).toBeNull()
  expect(root.querySelector('[onerror]')).toBeNull()
})
