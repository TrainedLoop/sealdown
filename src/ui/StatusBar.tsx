import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { documentStats } from '../editor/stats.ts'
import { Lock } from './icons.tsx'

export function StatusBar({
  text,
  saved,
  syncScroll,
  onSyncScrollChange,
}: {
  text: string
  saved: boolean
  /** Undefined hides the toggle (only meaningful in split mode). */
  syncScroll?: boolean
  onSyncScrollChange: (on: boolean) => void
}) {
  const { t } = useTranslation()
  const stats = useMemo(() => documentStats(text), [text])
  return (
    // A labeled group, not a live region: screen readers would otherwise announce every keystroke.
    <div className="status-bar" role="group" aria-label={t('status.name')}>
      <span className="status-counts">
        <span>{t('status.words', { count: stats.words })}</span>
        <span>{t('status.chars', { count: stats.chars })}</span>
        <span>{t('status.lines', { count: stats.lines })}</span>
        <span>{t('status.minutes', { count: stats.minutes })}</span>
      </span>
      <span className="status-right">
        {syncScroll !== undefined && (
          <button type="button" className="status-toggle" aria-pressed={syncScroll} onClick={() => onSyncScrollChange(!syncScroll)}>
            {t('status.sync')}
          </button>
        )}
        {saved && text !== '' && <span className="status-saved">{t('status.saved')}</span>}
        <span className="status-sealed">
          <Lock />
          {t('status.sealed')}
        </span>
      </span>
    </div>
  )
}
