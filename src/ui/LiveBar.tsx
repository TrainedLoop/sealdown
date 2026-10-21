import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { People } from './icons.tsx'
import { relativeTime } from './relativeTime.ts'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'conflict'

/** The strip above a live document: version, who saved it and when, and (when editing) the save state. */
export function LiveBar({
  version,
  author,
  createdAt,
  status,
  conflicts = 0,
  onResolve,
  onVersions,
  children,
}: {
  version: number
  author: string
  createdAt: string
  /** Absent on the read link. */
  status?: SaveStatus
  conflicts?: number
  onResolve?: () => void
  onVersions?: () => void
  children?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const time = relativeTime(createdAt, i18n.language)
  return (
    <section className="live-bar" aria-label={t('live.region')}>
      <People />
      <span className="live-bar-version">{t('live.version', { version })}</span>
      <span className="live-bar-by">{author ? t('live.by', { author, time }) : time}</span>
      {status && (
        <span className={`live-bar-status live-bar-${status}`} role="status">
          {status === 'conflict' ? (
            <>
              {t('live.conflicts', { count: conflicts })}
              {onResolve && (
                <button type="button" onClick={onResolve}>
                  {t('live.resolve')}
                </button>
              )}
            </>
          ) : (
            t(`live.${status}`)
          )}
        </span>
      )}
      {onVersions && (
        <button type="button" className="live-bar-versions" onClick={onVersions}>
          {t('live.versions')}
        </button>
      )}
      {children && <span className="live-bar-actions">{children}</span>}
    </section>
  )
}
