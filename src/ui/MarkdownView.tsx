import { useMemo } from 'react'
import { renderMarkdown } from '../render/markdown.ts'
import type { Theme } from './theme.ts'

export function MarkdownView({ text }: { text: string; theme: Theme }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
}
