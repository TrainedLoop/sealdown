import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from './focusTrap.ts'

/** Asks once for the name shown next to the versions this person saves. */
export function NamePrompt({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const [name, setName] = useState('')
  useFocusTrap(dialog)
  useLayoutEffect(() => {
    dialog.current?.querySelector('input')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop">
      <div ref={dialog} className="seal-modal name-prompt" role="dialog" aria-modal="true" aria-labelledby="name-prompt-title">
        <h2 id="name-prompt-title">{t('live.nameTitle')}</h2>
        <p className="seal-how">{t('live.nameHint')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() !== '') onSubmit(name.trim())
          }}
        >
          <input aria-label={t('live.nameLabel')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <div className="name-prompt-actions">
            <button type="button" onClick={onCancel}>
              {t('live.cancel')}
            </button>
            <button type="submit" className="primary" disabled={name.trim() === ''}>
              {t('live.nameSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
