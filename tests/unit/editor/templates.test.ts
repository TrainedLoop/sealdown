import { diagramTemplates } from '../../../src/editor/templates.ts'
import source from '../../../src/templates/diagrams.md?raw'

test('one template per mermaid example, named after its heading', () => {
  const templates = diagramTemplates()
  expect(templates).toHaveLength(source.match(/^```mermaid$/gm)!.length)
  expect(templates[0]).toEqual({ name: 'flowchart', source: expect.stringMatching(/^flowchart LR\n/) })
  for (const t of templates) {
    expect(t.name).toMatch(/\S/)
    expect(t.source).toMatch(/\S/)
    expect(t.source).not.toContain('```')
  }
})
