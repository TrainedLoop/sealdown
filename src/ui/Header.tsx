import { useTranslation } from 'react-i18next'
import { setLang } from '../i18n/index.ts'
import { useCurrentTitle } from './docTitle.ts'
import { useSlotRef } from './headerSlotsContext.ts'
import { Moon, SealMark, Sun } from './icons.tsx'
import type { Theme } from './theme.ts'

export function Header({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const { t, i18n } = useTranslation()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const title = useCurrentTitle()
  const centerRef = useSlotRef('center')
  const actionsRef = useSlotRef('actions')
  return (
    <header className="app-header">
      <div className="header-title">
        <a className="brand" href="#/">
          <SealMark />
          <span className="wordmark">{t('app.name')}</span>
        </a>
        {title && (
          <span className="doc-title" title={title}>
            {title}
          </span>
        )}
      </div>
      <div className="header-center" ref={centerRef} />
      <div className="header-actions">
        <div className="header-slot" ref={actionsRef} />
        <button
          type="button"
          className="header-button icon-only"
          aria-label={t(nextTheme === 'dark' ? 'theme.dark' : 'theme.light')}
          title={t(nextTheme === 'dark' ? 'theme.dark' : 'theme.light')}
          onClick={() => onThemeChange(nextTheme)}
        >
          {nextTheme === 'dark' ? <Moon /> : <Sun />}
        </button>
        <button
          type="button"
          className="header-button lang-button"
          aria-label={t('lang.switchTo')}
          title={t('lang.switchTo')}
          onClick={() => setLang(i18n.language === 'pt' ? 'en' : 'pt')}
        >
          {i18n.language === 'pt' ? 'EN' : 'PT'}
        </button>
      </div>
    </header>
  )
}
