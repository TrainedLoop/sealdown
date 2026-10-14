import source from '../templates/diagrams.md?raw'

/** `slug` names the thumbnails in public/diagram-thumbs (`<slug>-light.png`, `<slug>-dark.png`). */
export type DiagramTemplate = { name: string; slug: string; source: string }

/**
 * One example per Mermaid diagram type, from src/templates/diagrams.md: the same document the
 * visual regression tests render, so the menu and the tests stay in sync.
 */
export function diagramTemplates(): DiagramTemplate[] {
  const templates: DiagramTemplate[] = []
  for (const match of source.matchAll(/^## (.+)\n+```mermaid\n([\s\S]*?)\n```$/gm)) {
    const name = match[1].trim()
    templates.push({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), source: match[2] })
  }
  return templates
}
