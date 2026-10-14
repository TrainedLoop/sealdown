import { diagramTemplates } from '../../../src/editor/templates.ts'
import source from '../../../src/templates/diagrams.md?raw'

test('one template per mermaid example, named after its heading', () => {
  const templates = diagramTemplates()
  expect(templates).toHaveLength(source.match(/^```mermaid$/gm)!.length)
  expect(templates[0]).toEqual({ name: 'flowchart', slug: 'flowchart', source: expect.stringMatching(/^flowchart LR\n/) })
  for (const t of templates) {
    expect(t.name).toMatch(/\S/)
    expect(t.source).toMatch(/\S/)
    expect(t.source).not.toContain('```')
  }
})

test('every template has a slug and light/dark thumbnails', async () => {
  const { existsSync } = await import('node:fs')
  const templates = diagramTemplates()
  expect(new Set(templates.map((t) => t.slug)).size).toBe(templates.length)
  for (const t of templates) {
    expect(t.slug).toMatch(/^[a-z0-9-]+$/)
    for (const theme of ['light', 'dark']) {
      expect(existsSync(`public/diagram-thumbs/${t.slug}-${theme}.png`), `${t.slug}-${theme}`).toBe(true)
    }
  }
})
