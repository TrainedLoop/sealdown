import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LiveEditRoute } from '../live/links.ts'
import { openLive, type Opened } from '../live/session.ts'
import { defaultLiveStorage, LiveError } from '../storage/live.ts'
import { LiveCollabPage } from './LiveCollabPage.tsx'
import { LiveEditPage } from './LiveEditPage.tsx'
import type { Theme } from './theme.ts'

/**
 * A live document's edit link: Markdown documents are edited in real time (LiveCollabPage), JSON
 * ones keep save-and-merge (LiveEditPage).
 */
export function LiveDoc({ route, theme, readHash }: { route: LiveEditRoute; theme: Theme; readHash?: string }) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState<Opened | null>(null)
  const [failure, setFailure] = useState<'missing' | 'load' | null>(null)
  const { id, key, token } = route

  useEffect(() => {
    let cancelled = false
    openLive({ kind: 'live-edit', id, key, token }, defaultLiveStorage).then(
      (result) => !cancelled && setOpened(result),
      (error: unknown) => !cancelled && setFailure(error instanceof LiveError && error.kind === 'missing' ? 'missing' : 'load'),
    )
    return () => {
      cancelled = true
    }
  }, [id, key, token])

  if (failure) {
    return (
      <div className="notice" role="alert">
        <p>{t(failure === 'missing' ? 'live.errors.missing' : 'live.errors.load')}</p>
      </div>
    )
  }
  if (!opened) return <p className="status">{t('live.loading')}</p>
  if (opened.doc.type === 'markdown') return <LiveCollabPage route={route} opened={opened} theme={theme} readHash={readHash} />
  return <LiveEditPage route={route} theme={theme} readHash={readHash} />
}
