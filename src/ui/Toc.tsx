import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TocEntry } from '../render/toc.ts'
import { scrollToId } from './scroll.ts'

export const TOC_MIN_ENTRIES = 3

/** Contents beside the document; on narrow screens folded into a button above it. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (entries.length < TOC_MIN_ENTRIES) return null
  return (
    <nav className={open ? 'toc open' : 'toc'} aria-label={t('reader.toc')}>
      <p className="toc-title">{t('reader.toc')}</p>
      <button type="button" className="toc-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('reader.tocCount', { count: entries.length })}
      </button>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className={`toc-level-${entry.level}`}>
            <a
              href={`#${entry.id}`}
              onClick={(e) => {
                e.preventDefault()
                setOpen(false)
                scrollToId(document, entry.id)
              }}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
