import { useTranslation } from 'react-i18next'
import type { Route } from '../router/route.ts'

/** Markdown | JSON, beside the wordmark. Neither is current on a document someone shared. */
export function DocSwitch({ route }: { route: Route }) {
  const { t } = useTranslation()
  const links = [
    { kind: 'editor', href: '#/', label: t('docSwitch.markdown'), short: t('docSwitch.markdownShort') },
    { kind: 'json-editor', href: '#/json', label: t('docSwitch.json'), short: t('docSwitch.json') },
  ]
  return (
    <nav className="doc-switch tabs" aria-label={t('docSwitch.label')}>
      {links.map((link) => (
        <a
          key={link.kind}
          href={link.href}
          className={route.kind === link.kind ? 'tab active' : 'tab'}
          aria-current={route.kind === link.kind ? 'page' : undefined}
          aria-label={link.label}
        >
          <span className="doc-switch-long">{link.label}</span>
          <span className="doc-switch-short" aria-hidden="true">
            {link.short}
          </span>
        </a>
      ))}
    </nav>
  )
}
