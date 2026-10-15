import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from './ErrorMessage.tsx'
import { QrCode } from './QrCode.tsx'

export type SealResult =
  | { kind: 'link'; url: string; fallback: boolean; copied: boolean; protected: boolean; stored: boolean }
  | { kind: 'too-large' }
  | { kind: 'failed' }

/** The result of "Seal link": the link (already copied), what protects it, and a QR code. */
export function SealModal({ result, onClose }: { result: SealResult; onClose: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(result.kind === 'link' && result.copied)
  const ok = result.kind === 'link'

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="seal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seal-title"
      >
        {ok && <div className="seal-stamp" aria-hidden="true" />}
        <h2 id="seal-title">{t(ok ? 'seal.title' : 'seal.failedTitle')}</h2>

        {result.kind === 'too-large' && <ErrorMessage kind="too-large" />}
        {result.kind === 'failed' && <ErrorMessage kind="generate-failed" />}
        {result.kind === 'link' && (
          <>
            {result.fallback && <ErrorMessage kind="storage-unavailable" />}
            <div className="seal-link">
              <input
                data-testid="share-url"
                aria-label={t('editor.shareUrl')}
                readOnly
                value={result.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="primary" data-autofocus onClick={() => copy(result.url)}>
                {t('seal.copy')}
              </button>
            </div>
            <p role="status" className="seal-status">
              {t(copied ? 'editor.copied' : 'editor.copyManually')}
            </p>
            <ul className="seal-chips">
              <li>🔒 {t('seal.aes')}</li>
              {result.protected && <li>🔑 {t('seal.passwordProtected')}</li>}
              <li>{t(result.stored ? 'seal.shortLink' : 'seal.inLink')}</li>
            </ul>
            {result.protected && <p className="seal-reminder">{t('seal.reminder')}</p>}
            <p className="seal-how">{t('seal.how')}</p>
            <QrCode key={result.url} url={result.url} />
          </>
        )}
        <button type="button" className="seal-close" aria-label={t('seal.close')} onClick={onClose} {...(!ok && { 'data-autofocus': true })}>
          ✕
        </button>
      </div>
    </div>
  )
}
