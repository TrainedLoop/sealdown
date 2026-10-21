import { useTranslation } from 'react-i18next'
import type { Route } from '../router/route.ts'

/** Markdown | JSON, beside the wordmark. Neither is current on a document someone shared. */
export function DocSwitch({ route }: { route: Route }) {
  const { t } = useTranslation()
  const editing = route.kind === 'editor' || route.kind === 'json-editor' || route.kind === 'live-edit'
  const links = [
    { kind: 'editor', href: '#/', label: t('docSwitch.markdown'), short: t('docSwitch.markdownShort') },
    { kind: 'json-editor', href: '#/json', label: t('docSwitch.json'), short: t('docSwitch.json') },
  ]
  return (
    // On a shared document the switch is about starting something new: phones drop it there.
    <nav className={editing ? 'doc-switch tabs' : 'doc-switch tabs doc-switch-away'} aria-label={t('docSwitch.label')}>
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
