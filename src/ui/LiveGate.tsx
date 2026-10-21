import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import type { ProtectedLiveRoute } from '../live/links.ts'
import { unlockLive } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import { defaultLiveStorage, LiveError } from '../storage/live.ts'
import { LiveEditPage } from './LiveEditPage.tsx'
import { LiveReadPage } from './LiveReadPage.tsx'
import { PasswordPrompt } from './PasswordPrompt.tsx'
import type { Theme } from './theme.ts'

// The key derived from the password is kept for this tab only, so a reload doesn't ask again and
// nothing stays behind once the tab is closed.
const keyName = (id: string) => `sealdown.livekey.${id}`

function storedKey(id: string): string | null {
  try {
    return sessionStorage.getItem(keyName(id))
  } catch {
    return null
  }
}

function storeKey(id: string, key: string) {
  try {
    sessionStorage.setItem(keyName(id), key)
  } catch {
    // Not remembering it only means asking again after a reload.
  }
}

/** A password-protected live document: asks for the password, then opens it like any other. */
export function LiveGate({ route, theme }: { route: ProtectedLiveRoute; theme: Theme }) {
  const { t } = useTranslation()
  const [key, setKey] = useState(() => storedKey(route.id))
  const [failure, setFailure] = useState<'missing' | 'load' | null>(null)

  async function unlock(password: string): Promise<boolean> {
    try {
      const unlocked = await unlockLive(route, password, defaultLiveStorage)
      if (!unlocked) {
        track('password_failed')
        return false
      }
      storeKey(route.id, unlocked.key)
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
