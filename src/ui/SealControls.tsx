import { useTranslation } from 'react-i18next'
import { Lock } from './icons.tsx'
import type { SealLink } from './useSealLink.ts'

/** The password field and the "Seal link" button of an editor page's header. */
export function SealControls({ seal, empty }: { seal: SealLink; empty: boolean }) {
  const { t } = useTranslation()
  const { sealButton } = seal
  return (
    <div className="seal-controls">
      <input
        type="password"
        className="password-input"
        aria-label={t('password.label')}
        placeholder={t('seal.passwordPlaceholder')}
        autoComplete="new-password"
        disabled={seal.busy}
        value={seal.password}
        onChange={(e) => seal.setPassword(e.target.value)}
      />
      <button
        ref={sealButton}
        type="button"
        className="primary seal-button"
        disabled={seal.busy || empty}
        onClick={seal.generate}
      >
        <Lock />
        {t(seal.busy ? 'seal.sealing' : 'seal.button')}
      </button>
    </div>
  )
}
