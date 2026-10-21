import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listVersions, openLive, openVersion, type LiveRoute } from '../live/session.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { useFocusTrap } from './focusTrap.ts'
import { DiffView } from './DiffView.tsx'
import { relativeTime } from './relativeTime.ts'

type Item = { version: number; author: string; createdAt: string }

/** The saved versions of a live document: who saved each and when, what changed since, and Restore. */
export function VersionsPanel({
  route,
  onRestore,
  onClose,
}: {
  route: LiveRoute
  /** Present on the edit link only. */
  onRestore?: (version: number) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [selected, setSelected] = useState<{ version: number; text: string; current: string } | null>(null)
  useFocusTrap(dialog)

  useLayoutEffect(() => {
    dialog.current?.querySelector<HTMLElement>('.seal-close')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    listVersions(route, defaultLiveStorage).then(
      (rows) => !cancelled && setItems(rows),
      () => !cancelled && setItems([]),
    )
    return () => {
      cancelled = true
    }
  }, [route])

  async function pick(version: number) {
    const [old, latest] = await Promise.all([openVersion(route, version, defaultLiveStorage), openLive(route, defaultLiveStorage)])
    setSelected({ version, text: old.doc.text, current: latest.doc.text })
  }

  const latestVersion = items?.[0]?.version
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="seal-modal versions-panel" role="dialog" aria-modal="true" aria-labelledby="versions-title">
        <h2 id="versions-title">{t('live.versions')}</h2>
        <button type="button" className="seal-close" aria-label={t('live.close')} onClick={onClose}>
          ✕
        </button>
        <div className="versions-body">
          <ol className="versions-list">
            {items?.map((item) => (
              <li key={item.version}>
                <button
                  type="button"
                  aria-pressed={selected?.version === item.version}
                  onClick={() => void pick(item.version)}
                >
                  <span className="versions-number">
                    {t('live.versionItem', { version: item.version })}
                    {item.version === latestVersion && ` · ${t('live.current')}`}
                  </span>
                  <span className="versions-meta">
                    {item.author ? `${item.author}, ` : ''}
                    {relativeTime(item.createdAt, i18n.language)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="versions-detail">
            {selected ? (
              <>
                <p className="seal-how">{t('live.changes')}</p>
                <DiffView before={selected.text} after={selected.current} />
                {onRestore && selected.version !== latestVersion && (
                  <button type="button" className="primary" onClick={() => onRestore(selected.version)}>
                    {t('live.restore')}
                  </button>
                )}
              </>
            ) : (
              <p className="seal-how">{t('live.pickVersion')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
