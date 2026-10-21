import { useTranslation } from 'react-i18next'
import type { DocType } from '../share/docType.ts'
import { liveAvailable } from '../storage/live.ts'
import { useCommands } from './commands.ts'
import { People } from './icons.tsx'
import { ShareLiveModal } from './ShareLiveModal.tsx'
import { useShareLive } from './useShareLive.ts'

/** "Share to edit" beside Seal link. Hidden without Supabase: live documents only exist there. */
export function ShareLiveButton({ docType, getText }: { docType: DocType; getText: () => string }) {
  const { t } = useTranslation()
  const live = useShareLive(docType)
  const available = liveAvailable()
  const share = () => {
    const text = getText()
    if (text.trim() !== '' && !live.busy) void live.share(text)
  }
  // Also in the palette: on phones the header has no room for the button.
  useCommands('share-live', available ? [{ id: 'share-live', label: t('live.share'), run: share }] : [])
  if (!available) return null
  return (
    <>
      <button
        type="button"
        className="header-button share-live-button"
        aria-label={t(live.busy ? 'live.sharing' : 'live.share')}
        disabled={live.busy}
        title={live.failed ? t('live.shareFailed') : undefined}
        onClick={share}
      >
        <People />
        <span className="header-button-label">{t(live.busy ? 'live.sharing' : 'live.share')}</span>
      </button>
      {live.failed && (
        <span className="visually-hidden" role="alert">
          {t('live.shareFailed')}
        </span>
      )}
      {live.shared && <ShareLiveModal edit={live.shared.edit} read={live.shared.read} onClose={live.close} />}
    </>
  )
}
