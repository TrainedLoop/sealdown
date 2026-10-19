import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SealStamp } from './icons.tsx'

/** The sealed card a protected link opens on; `onSubmit` resolves to false for a wrong password. */
export function PasswordPrompt({ onSubmit }: { onSubmit: (password: string) => Promise<boolean> }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setWrong(false)
    const ok = await onSubmit(password)
    setBusy(false)
    if (!ok) setWrong(true)
  }

  return (
    <div className="unseal">
      <form className="unseal-card" onSubmit={submit}>
        <SealStamp />
        <h1>{t('seal.title')}</h1>
        <p>{t('password.locked')}</p>
        <label className="unseal-field">
          <span className="visually-hidden">{t('password.label')}</span>
          <input
            type="password"
            aria-label={t('password.label')}
            placeholder={t('password.label')}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {wrong && (
          <div className="notice" role="alert">
            <p>{t('errors.wrongPassword')}</p>
          </div>
        )}
        <button type="submit" className="primary" disabled={busy || password === ''}>
          {t(busy ? 'password.unsealing' : 'password.unseal')}
        </button>
      </form>
    </div>
  )
}
