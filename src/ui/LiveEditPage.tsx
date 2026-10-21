import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadAuthor, saveAuthor } from '../live/author.ts'
import { readLinkOf, type LiveEditRoute } from '../live/links.ts'
import { loadLocal, saveLocal, type LocalLive } from '../live/localState.ts'
import type { Choice } from '../live/merge.ts'
import { openLive, openVersion, restoreVersion, saveDraft, saveResolved, updateFromLatest, type Conflicted, type Latest, type SaveOutcome } from '../live/session.ts'
import { buildHash } from '../router/route.ts'
import type { DocType } from '../share/docType.ts'
import { defaultLiveStorage, LiveError, type LiveErrorKind } from '../storage/live.ts'
import { ConflictDialog } from './ConflictDialog.tsx'
import { EditorPage } from './EditorPage.tsx'
import { JsonEditorPage } from './JsonEditorPage.tsx'
import { LinkIcon } from './icons.tsx'
import { LiveBar, type Newer } from './LiveBar.tsx'
import type { LiveEditorProps } from './liveEditorProps.ts'
import { LiveReadPage } from './LiveReadPage.tsx'
import { NamePrompt } from './NamePrompt.tsx'
import { VersionsPanel } from './VersionsPanel.tsx'
import type { Theme } from './theme.ts'
import { useLivePolling } from './useLivePolling.ts'

type Info = { type: DocType; version: number; author: string; createdAt: string }
type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'forbidden' } | { kind: 'error'; error: LiveErrorKind }
type PendingConflict = { during: 'save' | 'update'; latest: Latest; author: string; createdAt: string; merge: Conflicted }

const ERROR_COPY: Partial<Record<LiveErrorKind, string>> = {
  network: 'live.errors.network',
  full: 'live.errors.full',
  'too-large': 'live.errors.tooLarge',
  missing: 'live.errors.missing',
}

/**
 * A live document through its edit link: the usual editor for its type, a draft kept in this
 * browser, and "Save version", which merges with whatever others saved meanwhile.
 */
export function LiveEditPage({ route, theme }: { route: LiveEditRoute; theme: Theme }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [info, setInfo] = useState<Info | null>(null)
  const [behind, setBehind] = useState<Newer | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<LiveErrorKind | null>(null)
  const [conflict, setConflict] = useState<PendingConflict | null>(null)
  const [askName, setAskName] = useState<((name: string | null) => void) | null>(null)
  const [readCopied, setReadCopied] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  // The draft this tab works on. Kept in memory so another tab saving never changes the text here.
  const local = useRef<LocalLive | null>(null)
  const getText = useRef<() => string>(() => local.current?.draft ?? '')
  // While a new text replaces the editor, the old editor's unmount flush must not write over it.
  const replacing = useRef(false)
  const { id, key, token } = route

  useEffect(() => {
    let cancelled = false
    const edit: LiveEditRoute = { kind: 'live-edit', id, key, token }
    ;(async () => {
      const opened = await openLive(edit, defaultLiveStorage)
      const stored = loadLocal(id)
      const unsaved = stored !== null && stored.draft !== stored.baseText && stored.base <= opened.version
      if (unsaved && stored.base < opened.version) {
        // Unsaved changes on an older version: keep them, and offer the newer one through Update.
        const base = await openVersion(edit, stored.base, defaultLiveStorage).catch(() => null)
        if (cancelled) return
        local.current = stored
        setInfo({ type: opened.doc.type, version: stored.base, author: base?.author ?? '', createdAt: base?.createdAt ?? opened.createdAt })
        setBehind({ version: opened.version, author: opened.author })
      } else {
        if (cancelled) return
        local.current = unsaved ? stored : { base: opened.version, baseText: opened.doc.text, draft: opened.doc.text }
        setInfo({ type: opened.doc.type, version: opened.version, author: opened.author, createdAt: opened.createdAt })
      }
      saveLocal(id, local.current!)
      setState({ kind: 'ready' })
    })().catch((error: unknown) => {
      if (!cancelled) setState({ kind: 'error', error: error instanceof LiveError ? error.kind : 'network' })
    })
    return () => {
      cancelled = true
    }
  }, [id, key, token])

  const [polled, clearPolled] = useLivePolling(route, info?.version ?? null)
  const newer = polled ?? behind

  useEffect(() => {
    replacing.current = false
  }, [editorKey])

  const draft = useMemo<LiveEditorProps['draft']>(
    () => ({
      load: () => local.current?.draft ?? '',
      save: (text) => {
        if (replacing.current || !local.current) return
        local.current = { ...local.current, draft: text }
        saveLocal(id, local.current)
      },
    }),
    [id],
  )

  function replaceText(next: LocalLive) {
    local.current = next
    saveLocal(id, next)
    replacing.current = true
    setEditorKey((k) => k + 1)
  }

  const askForName = useCallback(
    () => new Promise<string | null>((resolve) => setAskName(() => resolve)),
    [],
  )

  function fail(error: unknown) {
    const kind = error instanceof LiveError ? error.kind : 'network'
    if (kind === 'forbidden') setState({ kind: 'forbidden' })
    else setProblem(kind)
  }

  function settle(outcome: SaveOutcome, typed: string, author: string) {
    if (outcome.kind === 'conflicts') {
      setConflict({ during: 'save', latest: outcome.latest, author: '', createdAt: '', merge: outcome.merge })
      return
    }
    const current = getText.current()
    const next = { base: outcome.version, baseText: outcome.text, draft: current === typed ? outcome.text : current }
    // A merged save brings others' changes in: show them, unless the person kept typing meanwhile.
    if (outcome.merged && current === typed) replaceText(next)
    else {
      local.current = next
      saveLocal(id, next)
    }
    setInfo((old) => old && { ...old, version: outcome.version, author, createdAt: new Date().toISOString() })
    setBehind(null)
    clearPolled()
  }

  async function save() {
    if (busy || !local.current || !info) return
    const typed = getText.current()
    local.current = { ...local.current, draft: typed }
    const author = loadAuthor() ?? (await askForName())
    if (author === null) return
    setBusy(true)
    setProblem(null)
    try {
      settle(await saveDraft(route, local.current, info.type, author, defaultLiveStorage), typed, author)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function update() {
    if (busy || !local.current || !info) return
    local.current = { ...local.current, draft: getText.current() }
    setBusy(true)
    setProblem(null)
    try {
      const outcome = await updateFromLatest(route, local.current, info.type, defaultLiveStorage)
      if (outcome.kind === 'conflicts') {
        setConflict({ during: 'update', latest: outcome.latest, author: outcome.author, createdAt: '', merge: outcome.merge })
      } else {
        replaceText(outcome.local)
        setInfo((old) => old && { ...old, version: outcome.local.base, author: outcome.author, createdAt: outcome.createdAt })
        setBehind(null)
        clearPolled()
      }
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function restore(version: number) {
    if (busy || !local.current || !info) return
    setShowVersions(false)
    const author = loadAuthor() ?? (await askForName())
    if (author === null) return
    setBusy(true)
    setProblem(null)
    try {
      const outcome = await restoreVersion(route, version, local.current, info.type, author, defaultLiveStorage)
      // The restored text replaces what is on screen.
      if (outcome.kind === 'saved') replaceText({ base: outcome.version, baseText: outcome.text, draft: outcome.text })
      settle(outcome, getText.current(), author)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function resolve(choices: Record<number, Choice>) {
    if (!conflict || !info) return
    const text = conflict.merge.resolve(choices)
    setConflict(null)
    if (conflict.during === 'update') {
      replaceText({ base: conflict.latest.version, baseText: conflict.latest.text, draft: text })
      setInfo((old) => old && { ...old, version: conflict.latest.version, author: conflict.author })
      setBehind(null)
      clearPolled()
      return
    }
    const author = loadAuthor() ?? ''
    setBusy(true)
    try {
      const outcome = await saveResolved(route, conflict.latest, text, info.type, author, defaultLiveStorage)
      // The resolved text is what the person chose: show it.
      if (outcome.kind === 'saved') replaceText({ base: outcome.version, baseText: outcome.text, draft: outcome.text })
      settle(outcome, getText.current(), author)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  // Ctrl/Cmd+S saves a version (instead of the browser's "save page").
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
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
    const url = window.location.origin + import.meta.env.BASE_URL + buildHash(readLinkOf(route))
    try {
      await navigator.clipboard.writeText(url)
      setReadCopied(true)
    } catch {
      setReadCopied(false)
    }
  }

  const live: LiveEditorProps = {
    draft,
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
          <button type="button" className="primary seal-button" disabled={busy} onClick={() => void save()}>
            {t(busy ? 'live.saving' : 'live.save')}
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
      <LiveBar version={info.version} author={info.author} createdAt={info.createdAt} newer={newer} onUpdate={() => void update()} busy={busy} onVersions={() => setShowVersions(true)} />
      {showVersions && <VersionsPanel route={route} onRestore={(n) => void restore(n)} onClose={() => setShowVersions(false)} />}
      {problem && ERROR_COPY[problem] && (
        <div className="notice" role="alert">
          <p>{t(ERROR_COPY[problem] as 'live.errors.network')}</p>
        </div>
      )}
      {info.type === 'json' ? (
        <JsonEditorPage key={editorKey} live={live} />
      ) : (
        <EditorPage key={editorKey} theme={theme} live={live} />
      )}
      {askName && (
        <NamePrompt
          onSubmit={(name) => {
            saveAuthor(name)
            askName(name)
            setAskName(null)
          }}
          onCancel={() => {
            askName(null)
            setAskName(null)
          }}
        />
      )}
      {conflict && (
        <ConflictDialog conflicts={conflict.merge.conflicts} docType={info.type} onResolve={(choices) => void resolve(choices)} onCancel={() => setConflict(null)} />
      )}
    </div>
  )
}
