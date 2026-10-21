import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { People } from './icons.tsx'
import { relativeTime } from './relativeTime.ts'

export type Newer = { version: number; author: string }

/** The strip above a live document: version, who saved it and when, and news of a newer version. */
export function LiveBar({
  version,
  author,
  createdAt,
  newer,
  onUpdate,
  busy = false,
  children,
}: {
  version: number
  author: string
  createdAt: string
  newer?: Newer | null
  onUpdate?: () => void
  busy?: boolean
  children?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const time = relativeTime(createdAt, i18n.language)
  return (
    <section className="live-bar" aria-label={t('live.region')}>
      <People />
      <span className="live-bar-version">{t('live.version', { version })}</span>
      <span className="live-bar-by">{author ? t('live.by', { author, time }) : time}</span>
      {newer && (
        <span className="live-bar-newer" role="status">
          {t('live.newer', { author: newer.author || t('live.someone'), version: newer.version })}
          {onUpdate && (
            <button type="button" disabled={busy} onClick={onUpdate}>
              {t('live.update')}
            </button>
          )}
        </span>
      )}
      {children && <span className="live-bar-actions">{children}</span>}
    </section>
  )
}
