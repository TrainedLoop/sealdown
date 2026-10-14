import { useTranslation } from 'react-i18next'
import { setLang } from '../i18n/index.ts'
import type { Theme } from './theme.ts'

export function Header({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const { t, i18n } = useTranslation()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <header className="app-header">
      <a className="brand" href="#/">
        {t('app.name')}
      </a>
      <div className="header-actions">
        <button type="button" onClick={() => onThemeChange(nextTheme)}>
          {t(nextTheme === 'dark' ? 'theme.dark' : 'theme.light')}
        </button>
        <button type="button" onClick={() => setLang(i18n.language === 'pt' ? 'en' : 'pt')}>
          {t('lang.switchTo')}
        </button>
      </div>
    </header>
  )
}
