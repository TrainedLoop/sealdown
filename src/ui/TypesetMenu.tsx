import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TYPESETS, type Typeset } from './typeset.ts'

export function TypesetMenu({ value, onChange }: { value: Typeset; onChange: (typeset: Typeset) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu typeset-menu" ref={root}>
      <button
        type="button"
        className="header-button icon-only typeset-button"
        aria-label={t('typeset.button')}
        title={t('typeset.button')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Aa
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {TYPESETS.map((style) => (
            <button
              key={style}
              type="button"
              role="menuitemradio"
              aria-checked={value === style}
              className={`typeset-option typeset-${style}`}
              onClick={() => {
                onChange(style)
                setOpen(false)
              }}
            >
              <span className="typeset-sample">Aa</span>
              {t(`typeset.${style}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
