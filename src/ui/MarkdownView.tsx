import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { hydrate } from '../render/hydrate.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { scrollToId } from './scroll.ts'
import type { Theme } from './theme.ts'

/** In-document links (#heading) scroll instead of navigating: the hash holds the route. */
function onAnchorClick(event: MouseEvent<HTMLElement>) {
  const link = (event.target as Element).closest('a')
  const href = link?.getAttribute('href')
  if (!href?.startsWith('#') || href.startsWith('#/')) return
  event.preventDefault()
  let id = href.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    // keep the raw id
  }
  scrollToId(event.currentTarget, id)
}

export function MarkdownView({ text, theme }: { text: string; theme: Theme }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  const ref = useRef<HTMLElement>(null)
  const { i18n } = useTranslation()

  useEffect(() => {
    if (ref.current) void hydrate(ref.current, theme)
  }, [html, theme, i18n.language])

  return (
    <article ref={ref} className="markdown-body" onClick={onAnchorClick} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
