import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocType } from '../share/docType.ts'
import { liveAvailable } from '../storage/live.ts'
import { useCommands } from './commands.ts'
import { Chevron, Lock, People, ShareIcon } from './icons.tsx'
import type { SealLink } from './useSealLink.ts'
import { useShareLive } from './useShareLive.ts'

/**
 * The editor's one sharing entry point: Share opens a panel with a fixed, sealed copy (with an
 * optional password) and, when storage is available, a live document others can edit.
 */
export function ShareMenu({
  seal,
  empty,
  onSeal,
  docType,
  getText,
}: {
  seal: SealLink
  empty: boolean
  /** Seals the freshest text (JSON reads it from its editor); defaults to `seal.generate`. */
  onSeal?: () => void
  docType: DocType
  getText: () => string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const live = useShareLive(docType)
  const [livePassword, setLivePassword] = useState('')
  const available = liveAvailable()
  const { sealButton } = seal

  const shareLive = () => {
    const text = getText()
    if (text.trim() === '' || live.busy) return
    setOpen(false)
    void live.share(text, livePassword)
  }
  useCommands('share-live', available ? [{ id: 'share-live', label: t('live.share'), run: shareLive }] : [])

  useLayoutEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('input')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        setOpen(false)
        sealButton.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, sealButton])

  return (
    <div className="share-menu" ref={root}>
      <button
        ref={sealButton}
        type="button"
        className="primary seal-button share-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={seal.busy || live.busy}
        // The name stays "Share" while a link is being made; aria-busy (and the pulse) tell it.
        aria-busy={seal.busy || live.busy}
        onClick={() => setOpen(!open)}
      >
        <ShareIcon />
        {t('share.button')}
        <Chevron className="share-chevron" />
      </button>
      {open && (
        <div ref={panel} className="share-panel" role="dialog" aria-label={t('share.title')}>
          <section>
            <h3>
              <Lock />
              {t('share.sealTitle')}
            </h3>
            <p>{t('share.sealHint')}</p>
            <form
              className="share-seal"
              onSubmit={(e) => {
                e.preventDefault()
                if (empty) return
                setOpen(false)
                if (onSeal) onSeal()
                else void seal.generate()
              }}
            >
              <input
                type="password"
                className="password-input"
                aria-label={t('password.label')}
                placeholder={t('seal.passwordPlaceholder')}
                autoComplete="new-password"
                value={seal.password}
                onChange={(e) => seal.setPassword(e.target.value)}
              />
              <button type="submit" className="primary" disabled={empty}>
                {t('seal.button')}
              </button>
            </form>
          </section>
          {available && (
            <section>
              <h3>
                <People />
                {t('share.liveTitle')}
              </h3>
              <p>{t('share.liveHint')}</p>
              <form
                className="share-seal"
                onSubmit={(e) => {
                  e.preventDefault()
                  shareLive()
                }}
              >
                <input
                  type="password"
                  className="password-input"
                  aria-label={t('share.livePassword')}
                  placeholder={t('seal.passwordPlaceholder')}
                  autoComplete="new-password"
                  value={livePassword}
                  onChange={(e) => setLivePassword(e.target.value)}
                />
                <button type="submit" disabled={empty}>
                  {t('live.share')}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
      {live.failed && (
        <span className="visually-hidden" role="alert">
          {t('live.shareFailed')}
        </span>
      )}
    </div>
  )
}
