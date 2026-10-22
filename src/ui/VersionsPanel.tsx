import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listVersions, openLive, openVersion, type LiveRoute } from '../live/session.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { useFocusTrap } from './focusTrap.ts'
import { DiffView } from './DiffView.tsx'
import { relativeTime } from './relativeTime.ts'

type Item = { version: number; authors: string[]; label: string | null; createdAt: string }

/**
 * A live document's history: named versions pinned first, then automatic checkpoints, each with
 * when and who; what changed since; Restore and Mark version on the edit link.
 */
export function VersionsPanel({
  route,
  current,
  onRestore,
  onMark,
  onClose,
}: {
  route: LiveRoute
  /** The text on screen now, to compare with (else the stored current state). */
  current?: string
  /** Present on the edit link only. */
  onRestore?: (version: number, text: string) => void
  /** Present on the edit link only: names the current text as a pinned version. */
  onMark?: (label: string) => Promise<void>
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [selected, setSelected] = useState<{ version: number; text: string; current: string } | null>(null)
  const [naming, setNaming] = useState(false)
  const [label, setLabel] = useState('')
  const [reload, setReload] = useState(0)
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
  }, [route, reload])

  async function pick(version: number) {
    const old = await openVersion(route, version, defaultLiveStorage)
    const now = current ?? (await openLive(route, defaultLiveStorage)).doc.text
    setSelected({ version, text: old.doc.text, current: now })
  }

  async function mark() {
    const name = label.trim()
    if (!name || !onMark) return
    await onMark(name)
    setNaming(false)
    setLabel('')
    setReload((n) => n + 1)
  }

  const named = items?.filter((item) => item.label) ?? []
  const automatic = items?.filter((item) => !item.label) ?? []
  const row = (item: Item) => (
    <li key={item.version} className={item.label ? 'versions-named' : undefined}>
      <button type="button" aria-pressed={selected?.version === item.version} onClick={() => void pick(item.version)}>
        <span className="versions-number">{item.label ?? t('live.versionItem', { version: item.version })}</span>
        <span className="versions-meta">
          {item.authors.length > 0 ? `${item.authors.join(', ')}, ` : ''}
          {relativeTime(item.createdAt, i18n.language)}
        </span>
      </button>
    </li>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="seal-modal versions-panel" role="dialog" aria-modal="true" aria-labelledby="versions-title">
        <h2 id="versions-title">{t('live.versions')}</h2>
        <button type="button" className="seal-close" aria-label={t('live.close')} onClick={onClose}>
          ✕
        </button>
        <div className="versions-body">
          <div className="versions-side">
            {onMark &&
              (naming ? (
                <form
                  className="versions-mark"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void mark()
                  }}
                >
                  <input aria-label={t('live.versionName')} value={label} maxLength={80} autoFocus onChange={(e) => setLabel(e.target.value)} />
                  <button type="submit" className="primary" disabled={label.trim() === ''}>
                    {t('live.saveName')}
                  </button>
                </form>
              ) : (
                <button type="button" className="versions-mark-button" onClick={() => setNaming(true)}>
                  {t('live.markVersion')}
                </button>
              ))}
            <ol className="versions-list">
              {named.map(row)}
              {automatic.map(row)}
            </ol>
          </div>
          <div className="versions-detail">
            {selected ? (
              <>
                <p className="seal-how">{t('live.changes')}</p>
                <DiffView before={selected.text} after={selected.current} />
                {onRestore && selected.text !== selected.current && (
                  <button type="button" className="primary" onClick={() => onRestore(selected.version, selected.text)}>
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
