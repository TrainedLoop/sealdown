import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from './focusTrap.ts'
import { People } from './icons.tsx'
import { QrCode } from './QrCode.tsx'

/** The result of "Share to edit": the edit link (for collaborators) and the read link (for everyone else). */
export function ShareLiveModal({ edit, read, protected: locked = false, onClose }: { edit: string; read: string; protected?: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)

  // Before paint, like the seal dialog: focus is inside from the first frame.
  useLayoutEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="seal-modal live-share" role="dialog" aria-modal="true" aria-labelledby="live-share-title">
        <People className="live-share-icon" />
        <h2 id="live-share-title">{t('live.sharedTitle')}</h2>
        <LinkRow label={t('live.editLink')} url={edit} testId="live-edit-url" autofocus />
        <p className="seal-reminder">{t('live.editNote')}</p>
        <LinkRow label={t('live.readLink')} url={read} testId="live-read-url" />
        <p className="seal-how">{t('live.readNote')}</p>
        {locked && <p className="seal-reminder">{t('seal.reminder')}</p>}
        <button type="button" className="seal-close" aria-label={t('seal.close')} onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  )
}

function LinkRow({ label, url, testId, autofocus = false }: { label: string; url: string; testId: string; autofocus?: boolean }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="live-link">
      <h3>{label}</h3>
      <div className="seal-link">
        <input data-testid={testId} aria-label={label} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="primary" onClick={copy} {...(autofocus && { 'data-autofocus': true })}>
          {t(copied ? 'code.copied' : 'seal.copy')}
        </button>
      </div>
      <QrCode key={url} url={url} />
    </div>
  )
}
