import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import { loadAuthor, saveAuthor } from '../live/author.ts'
import { readLinkOf, type LiveEditRoute } from '../live/links.ts'
import { loadLocal, saveLocal, type LocalLive } from '../live/localState.ts'
import type { Choice } from '../live/merge.ts'
import {
  carryOver,
  openLive,
  restoreVersion,
  saveDraft,
  saveResolved,
  updateFromLatest,
  type Conflicted,
  type Latest,
  type SaveOutcome,
} from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import type { DocType } from '../share/docType.ts'
import type { Incoming } from '../editor/incoming.ts'
import { defaultLiveStorage, LiveError, type LiveErrorKind } from '../storage/live.ts'
import { ConflictDialog } from './ConflictDialog.tsx'
import { EditorPage } from './EditorPage.tsx'
import { LinkIcon } from './icons.tsx'
import { JsonEditorPage } from './JsonEditorPage.tsx'
import { LiveBar, type SaveStatus } from './LiveBar.tsx'
import type { LiveEditorProps } from './liveEditorProps.ts'
import { LiveReadPage } from './LiveReadPage.tsx'
import { NamePrompt } from './NamePrompt.tsx'
import type { Theme } from './theme.ts'
import { useLivePolling } from './useLivePolling.ts'
import { VersionsPanel } from './VersionsPanel.tsx'

/** Quiet time after the editor reports an edit before a version is saved on its own. */
const AUTOSAVE_MS = 1500
/** Retries after a failed connection wait longer each time, up to a minute. */
const RETRY_MIN_MS = 5000
const RETRY_MAX_MS = 60_000

type Info = { type: DocType; version: number; author: string; createdAt: string }
type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'forbidden' } | { kind: 'error'; error: LiveErrorKind }
/** `mine` is the text the conflict was found with; typing since is carried onto the resolution. */
type PendingConflict = { during: 'save' | 'update'; mine: string; latest: Latest; author: string; createdAt: string; merge: Conflicted }

const ERROR_COPY: Partial<Record<LiveErrorKind, string>> = {
  network: 'live.errors.network',
  full: 'live.errors.full',
  'too-large': 'live.errors.tooLarge',
  missing: 'live.errors.missing',
}

/**
 * A live document through its edit link: the usual editor for its type. Edits save on their own
 * after a short pause, and versions others save are merged into the text on screen as they arrive.
 * Only changes both sides made to the same part wait for the person to choose.
 */
export function LiveEditPage({ route, theme, readHash }: { route: LiveEditRoute; theme: Theme; readHash?: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [info, setInfo] = useState<Info | null>(null)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [incoming, setIncoming] = useState<Incoming | undefined>(undefined)
  const [problem, setProblem] = useState<LiveErrorKind | null>(null)
  const [conflict, setConflict] = useState<PendingConflict | null>(null)
  const [showConflict, setShowConflict] = useState(false)
  const [askName, setAskName] = useState(false)
  const [readCopied, setReadCopied] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  // The draft this tab works on, kept in memory so another tab saving never changes the text here.
  const local = useRef<LocalLive | null>(null)
  const getText = useRef<() => string>(() => local.current?.draft ?? '')
  const infoRef = useRef<Info | null>(null)
  const busy = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A pending conflict holds autosave and receiving until the person chooses.
  const held = useRef(false)
  const firstSave = useRef(true)
  // After an error: `stopped` (the token stopped working) ends saving; `waitForEdit` (too large,
  // database full) waits for the next change; `retryMs` spaces out retries after a failed connection.
  const stopped = useRef(false)
  const waitForEdit = useRef(false)
  const retryMs = useRef(0)
  const { id, key, token } = route

  useEffect(() => {
    infoRef.current = info
  }, [info])
  useEffect(() => {
    held.current = conflict !== null
  }, [conflict])

  useEffect(() => {
    let cancelled = false
    const edit: LiveEditRoute = { kind: 'live-edit', id, key, token }
    ;(async () => {
      const opened = await openLive(edit, defaultLiveStorage)
      if (cancelled) return
      const stored = loadLocal(id)
      const unsaved = stored !== null && stored.draft !== stored.baseText && stored.base <= opened.version
      // Unsaved changes from an earlier visit are kept; their first save merges whatever came since.
      local.current = unsaved ? stored : { base: opened.version, baseText: opened.doc.text, draft: opened.doc.text }
      saveLocal(id, local.current)
      setInfo({ type: opened.doc.type, version: opened.version, author: opened.author, createdAt: opened.createdAt })
      setStatus(unsaved ? 'unsaved' : 'saved')
      track('live_opened', { access: 'edit' })
      setState({ kind: 'ready' })
      if (loadAuthor() === null) setAskName(true)
    })().catch((error: unknown) => {
      if (!cancelled) setState({ kind: 'error', error: error instanceof LiveError ? error.kind : 'network' })
    })
    return () => {
      cancelled = true
      clearTimeout(timer.current)
    }
  }, [id, key, token])

  function persist(next: LocalLive) {
    local.current = next
    saveLocal(id, next)
  }

  /**
   * Puts `text` on screen, computed when the editor held `from`. The editor applies it against what
   * it holds when it arrives, carrying over anything typed in between (as the smallest edit).
   */
  function show(from: string, text: string) {
    const type = infoRef.current!.type
    setIncoming((old) => ({
      seq: (old?.seq ?? 0) + 1,
      rebase: (current) => (current === from ? text : carryOver(type, from, current, text)),
    }))
  }

  function fail(error: unknown) {
    const kind = error instanceof LiveError ? error.kind : 'network'
    if (kind === 'forbidden') {
      stopped.current = true
      clearTimeout(timer.current)
      setState({ kind: 'forbidden' })
      return
    }
    setProblem(kind)
    if (kind === 'network') retryMs.current = Math.min(Math.max(retryMs.current * 2, RETRY_MIN_MS), RETRY_MAX_MS)
    else waitForEdit.current = true
  }

  function succeeded() {
    retryMs.current = 0
    waitForEdit.current = false
    setProblem(null)
  }

  const unsavedNow = () => local.current !== null && getText.current() !== local.current.baseText

  function schedule() {
    clearTimeout(timer.current)
    if (stopped.current || waitForEdit.current) return
    timer.current = setTimeout(() => void saveRef.current(), retryMs.current || AUTOSAVE_MS)
  }

  /** Applies a save's result; returns false when it ended in a conflict. */
  function settle(outcome: SaveOutcome, typed: string, author: string): boolean {
    if (outcome.kind === 'conflicts') {
      persist({ ...local.current!, draft: getText.current() })
      held.current = true
      setConflict({ during: 'save', mine: typed, latest: outcome.latest, author: '', createdAt: '', merge: outcome.merge })
      return false
    }
    // Merged saves, and the first of the visit: one event per autosave pause would be noise.
    if (outcome.merged || firstSave.current) track('version_saved', { merged: outcome.merged, conflicts: 0 })
    firstSave.current = false
    const saved = { base: outcome.version, baseText: outcome.text }
    const current = getText.current()
    if (current === typed) {
      persist({ ...saved, draft: outcome.text })
      if (outcome.merged) show(typed, outcome.text)
    } else if (!outcome.merged) {
      persist({ ...saved, draft: current })
    } else {
      // Typed on while a merged save ran: carry the late typing onto the merged text. If it
      // overlaps, keep the old base so the next save merges the others' changes in again.
      const carried = carryOver(infoRef.current!.type, typed, current, outcome.text)
      if (carried !== null) {
        persist({ ...saved, draft: carried })
        show(current, carried)
      } else {
        persist({ ...local.current!, draft: current })
      }
    }
    setInfo((old) => old && { ...old, version: outcome.version, author, createdAt: new Date().toISOString() })
    succeeded()
    return true
  }

  /** Runs `work` alone (saves, receives and restores never overlap), then settles the status. */
  async function exclusive(work: () => Promise<void>) {
    busy.current = true
    try {
      await work()
    } finally {
      busy.current = false
    }
    if (stopped.current) return
    if (held.current) {
      setStatus('conflict')
    } else if (again.current || unsavedNow()) {
      again.current = false
      setStatus('unsaved')
      schedule()
    } else {
      setStatus('saved')
    }
  }

  async function save() {
    clearTimeout(timer.current)
    if (!local.current || !infoRef.current || held.current || stopped.current) return
    if (busy.current) {
      again.current = true
      return
    }
    const typed = getText.current()
    persist({ ...local.current, draft: typed })
    if (typed === local.current.baseText) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    const author = loadAuthor() ?? ''
    await exclusive(async () => {
      try {
        settle(await saveDraft(route, local.current!, infoRef.current!.type, author, defaultLiveStorage), typed, author)
      } catch (error) {
        fail(error)
      }
    })
  }

  // Someone else saved: merge their version into the text on screen right away.
  async function receive() {
    if (!local.current || !infoRef.current || busy.current || held.current) return
    const before = getText.current()
    persist({ ...local.current, draft: before })
    await exclusive(async () => {
      try {
        const outcome = await updateFromLatest(route, local.current!, infoRef.current!.type, defaultLiveStorage)
        if (outcome.kind === 'conflicts') {
          held.current = true
          setConflict({ during: 'update', mine: before, latest: outcome.latest, author: outcome.author, createdAt: outcome.createdAt, merge: outcome.merge })
          return
        }
        const now = getText.current()
        const carried = carryOver(infoRef.current!.type, before, now, outcome.local.draft)
        if (carried === null) return // typed over the incoming change meanwhile: the next save merges it
        persist({ ...outcome.local, draft: carried })
        show(now, carried)
        setInfo((old) => old && { ...old, version: outcome.local.base, author: outcome.author, createdAt: outcome.createdAt })
      } catch {
        // The next poll tries again.
      }
    })
  }

  const saveRef = useRef(save)
  const receiveRef = useRef(receive)
  useEffect(() => {
    saveRef.current = save
    receiveRef.current = receive
  })

  useLivePolling(route, state.kind === 'ready' ? (info?.version ?? null) : null, () => void receiveRef.current())

  const draft = useMemo<LiveEditorProps['draft']>(
    () => ({
      load: () => local.current?.draft ?? '',
      save: (text) => {
        if (!local.current) return
        local.current = { ...local.current, draft: text }
        saveLocal(id, local.current)
        waitForEdit.current = false
        if (text === local.current.baseText || held.current || stopped.current) return
        if (!busy.current) setStatus('unsaved')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS)
      },
    }),
    [id],
  )

  async function resolve(choices: Record<number, Choice>) {
    if (!conflict || !infoRef.current || busy.current) return
    const pending = conflict
    const now = getText.current()
    // Typing done while the conflict waited is carried onto the resolution.
    const text = carryOver(infoRef.current.type, pending.mine, now, pending.merge.resolve(choices))
    track('conflict_resolved', { conflicts: pending.merge.conflicts.length })
    held.current = false
    setConflict(null)
    setShowConflict(false)
    if (text === null) {
      // The later typing overlaps the resolution: save it again, which finds the conflict anew.
      persist({ ...local.current!, draft: now })
      schedule()
      return
    }
    show(now, text)
    if (pending.during === 'update') {
      persist({ base: pending.latest.version, baseText: pending.latest.text, draft: text })
      setInfo((old) => old && { ...old, version: pending.latest.version, author: pending.author, createdAt: pending.createdAt || old.createdAt })
      setStatus(text === pending.latest.text ? 'saved' : 'unsaved')
      if (text !== pending.latest.text) schedule()
      return
    }
    // Save the resolution on top of the version it was resolved against.
    setStatus('saving')
    const author = loadAuthor() ?? ''
    await exclusive(async () => {
      try {
        settle(await saveResolved(route, pending.latest, text, infoRef.current!.type, author, defaultLiveStorage), text, author)
      } catch (error) {
        fail(error)
      }
    })
  }

  async function restore(version: number) {
    if (busy.current || held.current || !local.current || !infoRef.current) return
    // Restoring replaces the text on screen: unsaved changes would be lost.
    if (unsavedNow() && !window.confirm(t('live.restoreConfirm'))) return
    clearTimeout(timer.current)
    setShowVersions(false)
    setStatus('saving')
    const author = loadAuthor() ?? ''
    await exclusive(async () => {
      try {
        const outcome = await restoreVersion(route, version, local.current!, infoRef.current!.type, author, defaultLiveStorage)
        if (outcome.kind !== 'saved') return void settle(outcome, getText.current(), author)
        track('version_restored')
        persist({ base: outcome.version, baseText: outcome.text, draft: outcome.text })
        show(getText.current(), outcome.text)
        succeeded()
        setInfo((old) => old && { ...old, version: outcome.version, author, createdAt: new Date().toISOString() })
      } catch (error) {
        fail(error)
      }
    })
  }

  // Ctrl/Cmd+S saves right away (instead of the browser's "save page").
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function copyReadLink() {
    // A password-protected document's read link carries no key: the page passes it in.
    const url = window.location.origin + import.meta.env.BASE_URL + (readHash ?? buildHash(readLinkOf(route)))
    try {
      await navigator.clipboard.writeText(url)
      setReadCopied(true)
    } catch {
      setReadCopied(false)
    }
  }

  const submitName = useCallback((name: string) => {
    saveAuthor(name)
    setAskName(false)
  }, [])
  const cancelName = useCallback(() => setAskName(false), [])
  const closeConflict = useCallback(() => setShowConflict(false), [])
  const closeVersions = useCallback(() => setShowVersions(false), [])

  const live: LiveEditorProps = {
    draft,
    incoming,
    actions: (current) => {
      getText.current = current
      return (
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
      )
    },
  }

  if (state.kind === 'forbidden') return <LiveReadPage route={readLinkOf(route)} theme={theme} notice={t('live.readOnly')} />
  if (state.kind === 'loading') return <p className="status">{t('live.loading')}</p>
  if (state.kind === 'error' || !info) {
    const missing = state.kind === 'error' && state.error === 'missing'
    return (
      <div className="notice" role="alert">
        <p>{t(missing ? 'live.errors.missing' : 'live.errors.load')}</p>
      </div>
    )
  }

  return (
    <div className="live-page">
      <LiveBar
        version={info.version}
        author={info.author}
        createdAt={info.createdAt}
        status={status}
        conflicts={conflict?.merge.conflicts.length ?? 0}
        onResolve={() => setShowConflict(true)}
        onVersions={() => {
          track('versions_viewed')
          setShowVersions(true)
        }}
      />
      {showVersions && <VersionsPanel route={route} onRestore={conflict ? undefined : (n) => void restore(n)} onClose={closeVersions} />}
      {problem && ERROR_COPY[problem] && (
        <div className="notice" role="alert">
          <p>{t(ERROR_COPY[problem] as 'live.errors.network')}</p>
        </div>
      )}
      {info.type === 'json' ? <JsonEditorPage live={live} /> : <EditorPage theme={theme} live={live} />}
      {askName && <NamePrompt onSubmit={submitName} onCancel={cancelName} />}
      {conflict && showConflict && (
        <ConflictDialog conflicts={conflict.merge.conflicts} docType={info.type} onResolve={(choices) => void resolve(choices)} onCancel={closeConflict} />
      )}
    </div>
  )
}
