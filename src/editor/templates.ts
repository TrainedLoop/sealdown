import source from '../templates/diagrams.md?raw'

export type DiagramTemplate = { name: string; source: string }

/**
 * One example per Mermaid diagram type, from src/templates/diagrams.md: the same document the
 * visual regression tests render, so the menu and the tests stay in sync.
 */
export function diagramTemplates(): DiagramTemplate[] {
  const templates: DiagramTemplate[] = []
  for (const match of source.matchAll(/^## (.+)\n+```mermaid\n([\s\S]*?)\n```$/gm)) {
    templates.push({ name: match[1].trim(), source: match[2] })
  }
  return templates
}
