import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { hydrate } from '../render/hydrate.ts'
import { renderMarkdown } from '../render/markdown.ts'
import type { Theme } from './theme.ts'

export function MarkdownView({ text, theme }: { text: string; theme: Theme }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  const ref = useRef<HTMLElement>(null)
  const { i18n } = useTranslation()

  useEffect(() => {
    if (ref.current) void hydrate(ref.current, theme)
  }, [html, theme, i18n.language])

  return <article ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
}
