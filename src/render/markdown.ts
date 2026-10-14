import { tex } from '@mdit/plugin-tex'
import MarkdownItFactory, { type MarkdownIt } from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
import { sanitize } from './sanitize.ts'

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function createMarkdown(): MarkdownIt {
  const md = new MarkdownItFactory({ html: true, linkify: true })
  const escape = md.utils.escapeHtml

  // Fences are emitted as placeholders; hydrate() renders diagrams and highlighting later, on demand.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0] ?? ''
    if (lang === 'mermaid') return `<pre class="mermaid-src"><code>${escape(token.content)}</code></pre>\n`
    const cls = /^[\w+#-]+$/.test(lang) ? ` class="language-${lang}"` : ''
    return `<pre><code${cls}>${escape(token.content)}</code></pre>\n`
  }

  md.use(anchor, { slugify })
  md.use(taskLists)
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
