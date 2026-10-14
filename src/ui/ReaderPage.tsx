import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Route } from '../router/route.ts'
import { LinkError, type LinkErrorKind } from '../share/errors.ts'
import { openRoute } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import type { Theme } from './theme.ts'

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
  return <MarkdownView text={state.text} theme={theme} />
}
