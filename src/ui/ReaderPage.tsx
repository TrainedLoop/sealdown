import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import { hydrate } from '../render/hydrate.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { splitSlides } from '../render/slides.ts'
import { extractToc } from '../render/toc.ts'
import type { Route } from '../router/route.ts'
import { LinkError, type LinkErrorKind } from '../share/errors.ts'
import { fetchProtected, openProtected, openRoute } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { downloadBlob } from './download.ts'
import { loadDraft, saveDraft } from './draft.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import { PasswordPrompt } from './PasswordPrompt.tsx'
import { Presentation } from './Presentation.tsx'
import type { Theme } from './theme.ts'
import { Toc } from './Toc.tsx'
import { ExportMenu } from './ExportMenu.tsx'
import { HeaderSlot } from './headerSlots.tsx'
import { Lock, Play } from './icons.tsx'
import { useDocumentTitle } from './docTitle.ts'

type ReadableRoute = Extract<Route, { kind: 'inline' | 'inline-sealed' | 'stored' | 'inline-protected' | 'stored-protected' }>

type State =
  | { kind: 'loading' }
  | { kind: 'locked'; bytes: Uint8Array }
  | { kind: 'ready'; text: string }
  | { kind: 'error'; error: LinkErrorKind }

export function ReaderPage({ route, theme }: { route: ReadableRoute; theme: Theme }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const routeKey = JSON.stringify(route)
  const isProtected = route.kind === 'inline-protected' || route.kind === 'stored-protected'
  const storage = route.kind === 'stored' || route.kind === 'stored-protected' ? 'stored' : 'inline'

  useEffect(() => {
    let cancelled = false
    const opened = JSON.parse(routeKey) as ReadableRoute
    const fail = (error: unknown) => {
      if (cancelled) return
      const kind = error instanceof LinkError ? error.kind : 'corrupt'
      track('link_opened', { storage, protected: isProtected, ok: false, error: kind })
      setState({ kind: 'error', error: kind })
    }
    if (opened.kind === 'inline-protected' || opened.kind === 'stored-protected') {
      // Fetched once; every password attempt reuses these bytes.
      fetchProtected(opened, defaultStorage).then((bytes) => !cancelled && setState({ kind: 'locked', bytes }), fail)
    } else {
      openRoute(opened, defaultStorage).then((text) => {
        if (cancelled) return
        track('link_opened', { storage, protected: false, ok: true })
        setState({ kind: 'ready', text })
      }, fail)
    }
    return () => {
      cancelled = true
    }
  }, [routeKey, attempt, storage, isProtected])

  async function unlock(bytes: Uint8Array, password: string): Promise<boolean> {
    try {
      const text = await openProtected(bytes, password)
      track('link_opened', { storage, protected: true, ok: true })
      setState({ kind: 'ready', text })
      return true
    } catch (error) {
      if (error instanceof LinkError && error.kind === 'wrong-password') {
        track('password_failed')
        return false
      }
      setState({ kind: 'error', error: error instanceof LinkError ? error.kind : 'corrupt' })
      return true
    }
  }

  if (state.kind === 'loading') return <p className="status">{t('reader.loading')}</p>
  if (state.kind === 'locked') return <PasswordPrompt onSubmit={(password) => unlock(state.bytes, password)} />
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
  return <Document text={state.text} theme={theme} sealed={route.kind !== 'inline'} />
}

function Document({ text, theme, sealed }: { text: string; theme: Theme; sealed: boolean }) {
  const { t } = useTranslation()
  const wrapper = useRef<HTMLDivElement>(null)
  const [slides, setSlides] = useState<string[] | null>(null)
  const html = useMemo(() => renderMarkdown(text), [text])
  useDocumentTitle(text)
  // DOMParser documents don't fetch images, unlike a detached element.
  const toc = useMemo(() => extractToc(new DOMParser().parseFromString(html, 'text/html').body), [html])

  const closePresentation = useCallback(() => setSlides(null), [])

  function editCopy() {
    const draft = loadDraft()
    if (draft.trim() !== '' && draft !== text && !window.confirm(t('reader.replaceDraft'))) return
    saveDraft(text)
    window.location.hash = '#/'
  }

  async function exportPdf() {
    const article = wrapper.current?.querySelector<HTMLElement>('.markdown-body')
    if (!article) return
    track('export', { format: 'pdf' })
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
      <HeaderSlot name="actions">
        <ExportMenu
          items={[
            {
              id: 'md',
              label: t('export.md'),
              run: () => {
                track('export', { format: 'md' })
                downloadBlob(new Blob([text], { type: 'text/markdown' }), 'document.md')
              },
            },
            { id: 'pdf', label: t('export.pdf'), run: () => void exportPdf() },
          ]}
        />
        <button
          type="button"
          className="header-button"
          onClick={() => {
            const split = splitSlides(html)
            track('present_started', { slides: split.length })
            setSlides(split)
          }}
        >
          <Play />
          <span className="header-button-label">{t('present.button')}</span>
        </button>
        <button type="button" className="primary reader-edit" onClick={editCopy}>
          {t('reader.editCopy')}
        </button>
      </HeaderSlot>
      {slides && <Presentation slides={slides} theme={theme} onClose={closePresentation} />}
      <div className={toc.length >= 3 ? 'reader-body with-toc' : 'reader-body'}>
        <Toc entries={toc} />
        <div className="reader-sheet">
          {sealed && (
            <p className="unsealed-badge">
              <Lock />
              {t('reader.unsealed')}
            </p>
          )}
          <MarkdownView html={html} theme={theme} />
        </div>
      </div>
    </div>
  )
}
