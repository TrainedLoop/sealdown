import { tex } from '@mdit/plugin-tex'
import alerts from 'markdown-it-github-alerts'
import MarkdownItFactory, { type MarkdownIt } from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
import { sanitize } from './sanitize.ts'

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
  // Headings made only of emoji or symbols would otherwise get an empty id.
  return slug || 'section'
}

function createMarkdown(): MarkdownIt {
  const md = new MarkdownItFactory({ html: true, linkify: true })
  const escape = md.utils.escapeHtml

  // Block elements remember their first source line, so the preview can follow the editor's scroll.
  md.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.block && token.nesting !== -1 && token.type !== 'inline') {
        token.attrSet('data-source-line', String(token.map[0] + 1))
      }
    }
  })

  // Fences are emitted as placeholders; hydrate() renders diagrams and highlighting later, on demand.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const line = token.map ? ` data-source-line="${token.map[0] + 1}"` : ''
    const lang = token.info.trim().split(/\s+/)[0] ?? ''
    if (lang === 'mermaid') return `<pre class="mermaid-src"${line}><code>${escape(token.content)}</code></pre>\n`
    const cls = /^[\w+#-]+$/.test(lang) ? ` class="language-${lang}"` : ''
    return `<pre${line}><code${cls}>${escape(token.content)}</code></pre>\n`
  }

  md.use(anchor, { slugify })
  md.use(taskLists)
  // GitHub-style callouts: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION].
  md.use(alerts)
  md.use(tex, {
    mathFence: true,
    render: (content, displayMode) =>
      displayMode
        ? `<div class="math-src" data-display="true">${escape(content)}</div>\n`
        : `<span class="math-src" data-display="false">${escape(content)}</span>`,
  })
  return md
}

let md: MarkdownIt | undefined

/** Markdown → sanitized HTML with placeholders for Mermaid, math and code blocks. */
export function renderMarkdown(text: string): string {
  md ??= createMarkdown()
  return sanitize(md.render(text))
}
