import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openLive, type Opened } from '../live/session.ts'
import type { LiveReadRoute } from '../live/links.ts'
import { defaultLiveStorage, LiveError } from '../storage/live.ts'
import { JsonDocument } from './JsonDocument.tsx'
import { LiveBar } from './LiveBar.tsx'
import { VersionsPanel } from './VersionsPanel.tsx'
import { Document } from './ReaderPage.tsx'
import type { Theme } from './theme.ts'
import { useLivePolling } from './useLivePolling.ts'

type State = { kind: 'loading' } | { kind: 'ready'; opened: Opened } | { kind: 'error'; missing: boolean }

/** A live document through its read link (or an edit link whose token no longer works). */
export function LiveReadPage({ route, theme, notice }: { route: LiveReadRoute; theme: Theme; notice?: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [showVersions, setShowVersions] = useState(false)
  const { id, key } = route
  useEffect(() => {
    let cancelled = false
    openLive({ kind: 'live-read', id, key }, defaultLiveStorage).then(
      (opened) => !cancelled && setState({ kind: 'ready', opened }),
      (error: unknown) => !cancelled && setState({ kind: 'error', missing: error instanceof LiveError && error.kind === 'missing' }),
    )
    return () => {
      cancelled = true
    }
  }, [id, key, attempt])
  const [newer, clearNewer] = useLivePolling(route, state.kind === 'ready' ? state.opened.version : null)

  if (state.kind === 'loading') return <p className="status">{t('live.loading')}</p>
  if (state.kind === 'error') {
    return (
      <div className="notice" role="alert">
        <p>{t(state.missing ? 'live.errors.missing' : 'live.errors.load')}</p>
        {!state.missing && (
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  }
  const { doc, version, author, createdAt } = state.opened
  const banner = (
    <>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <LiveBar
        version={version}
        author={author}
        createdAt={createdAt}
        newer={newer}
        onUpdate={() => {
          clearNewer()
          setAttempt((n) => n + 1)
        }}
        onVersions={() => setShowVersions(true)}
      />
      {showVersions && <VersionsPanel route={route} onClose={() => setShowVersions(false)} />}
    </>
  )
  if (doc.type === 'json') return <JsonDocument text={doc.text} sealed banner={banner} />
  return <Document text={doc.text} theme={theme} sealed banner={banner} />
}
