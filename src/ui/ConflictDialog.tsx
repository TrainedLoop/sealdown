import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Choice, Conflict } from '../live/merge.ts'
import type { DocType } from '../share/docType.ts'
import { useFocusTrap } from './focusTrap.ts'

/** Lists the parts both sides changed and lets the person pick what stays in each. */
export function ConflictDialog({
  conflicts,
  docType,
  onResolve,
  onCancel,
}: {
  conflicts: Conflict[]
  docType: DocType
  onResolve: (choices: Record<number, Choice>) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const [choices, setChoices] = useState<Record<number, Choice>>(() => Object.fromEntries(conflicts.map((c) => [c.id, 'mine'])))
  useFocusTrap(dialog)
  useLayoutEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input:checked')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Both sides one after the other only makes sense for lines of text.
  const options: Choice[] = docType === 'markdown' ? ['mine', 'theirs', 'both'] : ['mine', 'theirs']
  const label = (c: Conflict) => (c.label === 'document' ? t('live.document') : c.label)

  return (
    <div className="modal-backdrop">
      <div ref={dialog} className="seal-modal conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <h2 id="conflict-title">{t('live.conflictTitle')}</h2>
        <p className="seal-how">{t('live.conflictHint')}</p>
        <ol className="conflict-list">
          {conflicts.map((c) => (
            <li key={c.id}>
              <fieldset>
                <legend>{label(c)}</legend>
                <div className="conflict-sides">
                  <pre aria-label={t('live.mine')}>{c.mine || t('live.removed')}</pre>
                  <pre aria-label={t('live.theirs')}>{c.theirs || t('live.removed')}</pre>
                </div>
                <div className="conflict-choices">
                  {options.map((option) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name={`conflict-${c.id}`}
                        checked={choices[c.id] === option}
                        onChange={() => setChoices((old) => ({ ...old, [c.id]: option }))}
                      />
                      {t(`live.${option}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        <div className="name-prompt-actions">
          <button type="button" onClick={onCancel}>
            {t('live.cancel')}
          </button>
          <button type="button" className="primary" onClick={() => onResolve(choices)}>
            {t('live.keepChoices')}
          </button>
        </div>
      </div>
    </div>
  )
}
