import { useTranslation } from 'react-i18next'
import type { TocEntry } from '../render/toc.ts'
import { scrollToId } from './scroll.ts'

export const TOC_MIN_ENTRIES = 3

export function Toc({ entries }: { entries: TocEntry[] }) {
  const { t } = useTranslation()
  if (entries.length < TOC_MIN_ENTRIES) return null
  return (
    <nav className="toc" aria-label={t('reader.toc')}>
      <p className="toc-title">{t('reader.toc')}</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className={`toc-level-${entry.level}`}>
            <a
              href={`#${entry.id}`}
              onClick={(e) => {
                e.preventDefault()
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
