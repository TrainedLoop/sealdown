import { useTranslation } from 'react-i18next'
import type { LinkErrorKind } from '../share/errors.ts'

export type ErrorKind = LinkErrorKind | 'storage-unavailable' | 'too-large' | 'generate-failed'

const MESSAGE_KEYS = {
  corrupt: 'errors.corrupt',
  expired: 'errors.expired',
  network: 'errors.network',
  'unknown-format': 'errors.unknownFormat',
  'storage-unavailable': 'errors.storageUnavailable',
  'too-large': 'errors.tooLarge',
  'generate-failed': 'errors.generateFailed',
} as const

export function ErrorMessage({ kind, onRetry }: { kind: ErrorKind; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="notice" role="alert">
      <p>{t(MESSAGE_KEYS[kind])}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
