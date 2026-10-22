import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { track } from '../analytics.ts'
import { loadAuthor, saveAuthor } from '../live/author.ts'
import { startPersistence, type PersistenceStatus } from '../live/collab/persistence.ts'
import { useCollab } from '../live/collab/useCollab.ts'
import { takeShared } from '../live/keyStore.ts'
import { readLinkOf, type LiveEditRoute } from '../live/links.ts'
import { checkpointNow, type Opened } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import { defaultLiveStorage } from '../storage/live.ts'
import { EditorPage } from './EditorPage.tsx'
import { LinkIcon } from './icons.tsx'
import { LiveBar } from './LiveBar.tsx'
import type { LiveEditorProps } from './liveEditorProps.ts'
import { LiveReadPage } from './LiveReadPage.tsx'
import { NamePrompt } from './NamePrompt.tsx'
import { ShareLiveModal } from './ShareLiveModal.tsx'
import type { Theme } from './theme.ts'
import { VersionsPanel } from './VersionsPanel.tsx'

const ERROR_COPY: Partial<Record<PersistenceStatus, string>> = {
  network: 'live.errors.network',
  full: 'live.errors.full',
  'too-large': 'live.errors.tooLarge',
  missing: 'live.errors.missing',
}

/**
 * A Markdown live document through its edit link, edited in real time: everyone's keystrokes,
 * cursors and names as they happen (Yjs over encrypted Realtime), the current state saved a moment
 * after this tab's edits, and checkpoints in the history.
 */
export function LiveCollabPage({ route, opened, theme, readHash }: { route: LiveEditRoute; opened: Opened; theme: Theme; readHash?: string }) {
  const { t } = useTranslation()
  const [name, setName] = useState(loadAuthor)
  const [askName, setAskName] = useState(() => loadAuthor() === null)
  const collab = useCollab(route, opened, name)
  const [text, setText] = useState(opened.doc.text)
  const [saveStatus, setSaveStatus] = useState<PersistenceStatus>('saved')
  const [readCopied, setReadCopied] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [justShared, setJustShared] = useState(() => takeShared(route.id))
  // Everyone who edited since the last checkpoint: this person and whoever else showed up.
  const authors = useRef(new Set<string>())

  useEffect(() => {
    if (!collab) return
    const update = () => setText(collab.text.toString())
    update()
    collab.text.observe(update)
    return () => collab.text.unobserve(update)
  }, [collab])

  // The most people here at once besides this person, sent once when the page goes away (a count, never names).
  const maxPeers = useRef(0)
  useEffect(() => {
    for (const peer of collab?.peers ?? []) authors.current.add(peer.name)
    maxPeers.current = Math.max(maxPeers.current, collab?.peers.length ?? 0)
  }, [collab?.peers])

  useEffect(() => {
    let sent = false
    const onLeave = () => {
      if (sent) return
      sent = true
      track('collab_peers', { max: maxPeers.current }, true)
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  useEffect(() => {
    if (!collab) return
    const persistence = startPersistence({
      route,
      doc: collab.doc,
      storage: defaultLiveStorage,
      revision: opened.revision,
      isLocal: (origin) => origin !== collab.provider && origin !== 'storage' && origin !== 'local-storage',
      authors: () => {
        const names = [...authors.current]
        authors.current = new Set(loadAuthor() ? [loadAuthor()!] : [])
        return names
      },
      onStatus: setSaveStatus,
    })
    const onHide = () => {
      if (document.visibilityState === 'hidden') void persistence.flush()
    }
    // Ctrl/Cmd+S saves right away (instead of the browser's "save page").
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void persistence.flush()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('keydown', onKey)
      void persistence.flush().finally(() => persistence.stop())
    }
    // One persistence per collaboration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab?.doc])

  useEffect(() => {
    if (name) authors.current.add(name)
  }, [name])

  useEffect(() => track('live_opened', { access: 'edit', realtime: true }), [])

  const extension = useMemo(() => {
    if (!collab) return null
    const undoManager = new Y.UndoManager(collab.text)
    // Above CodeMirror's own history: Ctrl/Cmd+Z undoes only this person's edits.
    return [yCollab(collab.text, collab.awareness, { undoManager }), Prec.highest(keymap.of(yUndoManagerKeymap))]
  }, [collab])

  async function copyReadLink() {
    const url = window.location.origin + import.meta.env.BASE_URL + (readHash ?? buildHash(readLinkOf(route)))
    try {
      await navigator.clipboard.writeText(url)
      setReadCopied(true)
    } catch {
      setReadCopied(false)
    }
  }

  const restore = useCallback(
    (_version: number, oldText: string) => {
      if (!collab) return
      // One edit that everyone receives, undoable like any other.
      collab.doc.transact(() => {
        collab.text.delete(0, collab.text.length)
        collab.text.insert(0, oldText)
      })
      track('version_restored')
      setShowVersions(false)
    },
    [collab],
  )
  const mark = useCallback(
    async (label: string) => {
      if (!collab) return
      // Everyone who took part: edits since the last checkpoint, whoever is here now, and this person.
      const names = new Set([...authors.current, ...collab.peers.map((peer) => peer.name)])
      if (name) names.add(name)
      await checkpointNow(route, collab.text.toString(), [...names], defaultLiveStorage, label)
      track('version_named')
    },
    [collab, name, route],
  )
  const closeVersions = useCallback(() => setShowVersions(false), [])
  const closeShared = useCallback(() => setJustShared(null), [])
  const submitName = useCallback((value: string) => {
    saveAuthor(value)
    setName(value)
    setAskName(false)
  }, [])
  const cancelName = useCallback(() => setAskName(false), [])

  if (saveStatus === 'forbidden') return <LiveReadPage route={readLinkOf(route)} theme={theme} notice={t('live.readOnly')} />
  if (!collab || !extension) return <p className="status">{t('live.loading')}</p>

  const live: LiveEditorProps = {
    draft: { load: () => text, save: () => undefined },
    collab: { extension, text },
    actions: () => (
      <div className="seal-controls live-actions">
        <button
          type="button"
          className="header-button live-copy-read"
          aria-label={t(readCopied ? 'live.readCopied' : 'live.copyRead')}
          title={t('live.copyRead')}
          onClick={() => void copyReadLink()}
        >
          <LinkIcon />
          <span className="header-button-label">{t(readCopied ? 'live.readCopied' : 'live.copyRead')}</span>
        </button>
      </div>
    ),
  }

  const problem = ERROR_COPY[saveStatus]
  return (
    <div className="live-page">
      <LiveBar
        version={opened.revision}
        author=""
        createdAt={opened.stateAt}
        connection={collab.status}
        peers={collab.peers}
        onVersions={() => {
          track('versions_viewed')
          setShowVersions(true)
        }}
      />
      {problem && (
        <div className="notice" role="alert">
          <p>{t(problem as 'live.errors.network')}</p>
        </div>
      )}
      {showVersions && <VersionsPanel route={route} current={text} onRestore={restore} onMark={mark} onClose={closeVersions} />}
      <EditorPage theme={theme} live={live} />
      {justShared && (
        <ShareLiveModal edit={justShared.edit} read={justShared.read} protected={justShared.protected} onClose={closeShared} />
      )}
      {askName && !justShared && <NamePrompt onSubmit={submitName} onCancel={cancelName} />}
    </div>
  )
}
