import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

/** Asks for a protected document's password; `onSubmit` resolves to false for a wrong password. */
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
    <form className="password-prompt" onSubmit={submit}>
      <p>{t('password.locked')}</p>
      <label>
        {t('password.label')}
        <input
          type="password"
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
        {t(busy ? 'password.opening' : 'password.open')}
      </button>
    </form>
  )
}
