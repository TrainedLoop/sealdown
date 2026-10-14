import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hydrate } from '../render/hydrate.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { extractToc } from '../render/toc.ts'
import type { Route } from '../router/route.ts'
import { LinkError, type LinkErrorKind } from '../share/errors.ts'
import { openRoute } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { downloadBlob } from './download.ts'
import { saveDraft } from './draft.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import type { Theme } from './theme.ts'
import { Toc } from './Toc.tsx'

type State = { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'error'; error: LinkErrorKind }

export function ReaderPage({ route, theme }: { route: Extract<Route, { kind: 'inline' | 'stored' }>; theme: Theme }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const routeKey = JSON.stringify(route)

  useEffect(() => {
    let cancelled = false
    openRoute(JSON.parse(routeKey), defaultStorage).then(
      (text) => !cancelled && setState({ kind: 'ready', text }),
      (error: unknown) => {
        if (cancelled) return
        setState({ kind: 'error', error: error instanceof LinkError ? error.kind : 'corrupt' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [routeKey, attempt])

  if (state.kind === 'loading') return <p className="status">{t('reader.loading')}</p>
  if (state.kind === 'error') {
    const retry =
      state.error === 'network'
        ? () => {
            setState({ kind: 'loading' })
            setAttempt((n) => n + 1)
          }
        : undefined
    return <ErrorMessage kind={state.error} onRetry={retry} />
  }
  return <Document text={state.text} theme={theme} />
}

function Document({ text, theme }: { text: string; theme: Theme }) {
  const { t } = useTranslation()
  const wrapper = useRef<HTMLDivElement>(null)
  // DOMParser documents don't fetch images, unlike a detached element.
  const toc = useMemo(
    () => extractToc(new DOMParser().parseFromString(renderMarkdown(text), 'text/html').body),
    [text],
  )

  function editCopy() {
    saveDraft(text)
    window.location.hash = '#/'
  }

  async function exportPdf() {
    const article = wrapper.current?.querySelector<HTMLElement>('.markdown-body')
    if (!article) return
    // Print light whatever the reader uses: dark pages waste ink and diagrams bake their colors in.
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = 'light'
    await hydrate(article, 'light')
    try {
      window.print()
    } finally {
      root.dataset.theme = previous
      await hydrate(article, theme)
    }
  }

  return (
    <div className="reader" ref={wrapper}>
      <div className="reader-toolbar">
        <button type="button" onClick={editCopy}>
          {t('reader.editCopy')}
        </button>
        <button type="button" onClick={() => downloadBlob(new Blob([text], { type: 'text/markdown' }), 'document.md')}>
          {t('export.md')}
        </button>
        <button type="button" onClick={exportPdf}>
          {t('export.pdf')}
        </button>
      </div>
      <div className={toc.length >= 3 ? 'reader-body with-toc' : 'reader-body'}>
        <Toc entries={toc} />
        <MarkdownView text={text} theme={theme} />
      </div>
    </div>
  )
}
