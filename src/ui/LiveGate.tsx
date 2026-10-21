import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import type { ProtectedLiveRoute } from '../live/links.ts'
import { storedLiveKey, storeLiveKey } from '../live/keyStore.ts'
import { unlockLive } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import { defaultLiveStorage, LiveError } from '../storage/live.ts'
import { LiveEditPage } from './LiveEditPage.tsx'
import { LiveReadPage } from './LiveReadPage.tsx'
import { PasswordPrompt } from './PasswordPrompt.tsx'
import type { Theme } from './theme.ts'

/** A password-protected live document: asks for the password, then opens it like any other. */
export function LiveGate({ route, theme }: { route: ProtectedLiveRoute; theme: Theme }) {
  const { t } = useTranslation()
  const [key, setKey] = useState(() => storedLiveKey(route.id))
  const [failure, setFailure] = useState<'missing' | 'load' | null>(null)

  async function unlock(password: string): Promise<boolean> {
    try {
      const unlocked = await unlockLive(route, password, defaultLiveStorage)
      if (!unlocked) {
        track('password_failed')
        return false
      }
      storeLiveKey(route.id, unlocked.key)
      setKey(unlocked.key)
      return true
    } catch (error) {
      // Not a wrong password: the document is gone or couldn't be reached.
      setFailure(error instanceof LiveError && error.kind === 'missing' ? 'missing' : 'load')
      return true
    }
  }

  if (failure) {
    return (
      <div className="notice" role="alert">
        <p>{t(failure === 'missing' ? 'live.errors.missing' : 'live.errors.load')}</p>
      </div>
    )
  }
  if (!key) {
    return (
      <div className="live-gate">
        <PasswordPrompt onSubmit={unlock} />
      </div>
    )
  }
  const readHash = buildHash({ kind: 'live-read-protected', id: route.id })
  if (route.kind === 'live-edit-protected') {
    return <LiveEditPage route={{ kind: 'live-edit', id: route.id, key, token: route.token }} theme={theme} readHash={readHash} />
  }
  return <LiveReadPage route={{ kind: 'live-read', id: route.id, key }} theme={theme} />
}
