import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Choice, Conflict } from '../live/merge.ts'
import type { DocType } from '../share/docType.ts'
import { DiffView } from './DiffView.tsx'
import { useFocusTrap } from './focusTrap.ts'

/** The text a choice leaves in place of the conflicting part (Both: mine, then theirs). */
function chosen(c: Conflict, choice: Choice | undefined): string {
  if (choice === 'theirs') return c.theirs
  if (choice === 'both') return [c.mine, c.theirs].filter((side) => side !== '').join('\n')
  return c.mine
}

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
                  <section aria-label={t('live.yourChange')}>
                    <h3>{t('live.yourChange')}</h3>
                    <DiffView before={c.base} after={c.mine} context={c} />
                  </section>
                  <section aria-label={t('live.theirChange')}>
                    <h3>{t('live.theirChange')}</h3>
                    <DiffView before={c.base} after={c.theirs} context={c} />
                  </section>
                </div>
                <div className="conflict-choices" role="radiogroup" aria-label={label(c)}>
                  {options.map((option) => (
                    <label key={option} className={choices[c.id] === option ? 'active' : undefined}>
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
                <section className="conflict-result" aria-label={t('live.result')}>
                  <h3>{t('live.result')}</h3>
                  <DiffView before={c.base} after={chosen(c, choices[c.id])} context={c} />
                </section>
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
