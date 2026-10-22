import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { People } from './icons.tsx'
import { relativeTime } from './relativeTime.ts'
import type { ConnectionStatus } from '../live/collab/channel.ts'
import type { Peer } from '../live/collab/useCollab.ts'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'conflict'

/** The strip above a live document: version, who saved it and when, and (when editing) the save state. */
export function LiveBar({
  version,
  author,
  createdAt,
  status,
  conflicts = 0,
  onResolve,
  onVersions,
  connection,
  peers,
  children,
}: {
  version: number
  author: string
  createdAt: string
  /** Absent on the read link. */
  status?: SaveStatus
  conflicts?: number
  onResolve?: () => void
  onVersions?: () => void
  /** Real-time documents: the Realtime connection, and who else is editing. */
  connection?: ConnectionStatus
  peers?: Peer[]
  children?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const time = relativeTime(createdAt, i18n.language)
  return (
    <section className="live-bar" aria-label={t('live.region')}>
      <People />
      <span className="live-bar-version">{t('live.version', { version })}</span>
      {connection ? (
        <span className={`live-bar-status live-bar-${connection === 'connected' ? 'saved' : 'conflict'}`} role="status">
          {t(connection === 'connected' ? 'live.connected' : 'live.offline')}
        </span>
      ) : (
        <span className="live-bar-by">{author ? t('live.by', { author, time }) : time}</span>
      )}
      {peers && peers.length > 0 && (
        <span className="live-bar-peers" aria-label={t('live.here')}>
          {peers.map((peer) => (
            <span key={peer.clientId} className="live-peer">
              <span className="live-peer-dot" style={{ background: peer.color }} aria-hidden="true" />
              {peer.name}
            </span>
          ))}
        </span>
      )}
      {status && (
        <span className={`live-bar-status live-bar-${status}`} role="status">
          {status === 'conflict' ? (
            <>
              {t('live.conflicts', { count: conflicts })}
              {onResolve && (
                <button type="button" onClick={onResolve}>
                  {t('live.resolve')}
                </button>
              )}
            </>
          ) : (
            t(`live.${status}`)
          )}
        </span>
      )}
      {onVersions && (
        <button type="button" className="live-bar-versions" onClick={onVersions}>
          {t('live.versions')}
        </button>
      )}
      {children && <span className="live-bar-actions">{children}</span>}
    </section>
  )
}
