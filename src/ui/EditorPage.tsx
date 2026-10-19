import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { diagramTypes, track } from '../analytics.ts'
import type { EditorApi } from '../editor/CodeEditor.tsx'
import { DiagramPicker } from '../editor/DiagramPicker.tsx'
import { Toolbar } from '../editor/Toolbar.tsx'
import { diagramTemplates, type DiagramTemplate } from '../editor/templates.ts'
import { useCommands } from './commands.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { lineAtTop, syncTarget } from '../render/scrollSync.ts'
import { createLink } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { loadDraft, saveDraft } from './draft.ts'
import { MarkdownView } from './MarkdownView.tsx'
import { Toc, TOC_MIN_ENTRIES } from './Toc.tsx'
import { extractToc } from '../render/toc.ts'
import { useMode, type Mode } from './mode.ts'
import { readPref, writePref } from './prefs.ts'
import { StatusBar } from './StatusBar.tsx'
import { useDocumentTitle } from './docTitle.ts'
import { SealModal, type SealResult } from './SealModal.tsx'
import { ExportMenu } from './ExportMenu.tsx'
import { HeaderSlot } from './headerSlots.tsx'
import { Folder, Lock } from './icons.tsx'
import { downloadBlob } from './download.ts'
import { hydrate } from '../render/hydrate.ts'
import type { Theme } from './theme.ts'



const DRAFT_DELAY_MS = 500
const MODES: Mode[] = ['write', 'split', 'read']
const TEMPLATES = diagramTemplates()

const CodeEditor = lazy(() => import('../editor/CodeEditor.tsx'))

const MAX_FILE_BYTES = 5 * 1024 * 1024
const TEXT_FILE = /\.(md|markdown|mdown|txt)$/i

type FileProblem = 'not-text' | 'too-large'

export function EditorPage({ theme }: { theme: Theme }) {
  const { t } = useTranslation()
  const [text, setText] = useState(loadDraft)
  const { mode, setMode, splitAvailable } = useMode()
  const previewPane = useRef<HTMLDivElement>(null)
  const [syncScroll, setSyncScrollState] = useState(() => readPref('sealdown.syncScroll') !== 'false')
  const setSyncScroll = (on: boolean) => {
    writePref('sealdown.syncScroll', String(on))
    setSyncScrollState(on)
  }
  const [saved, setSaved] = useState(true)
  useDocumentTitle(text)
  const [shared, setShared] = useState<SealResult | null>(null)
  const sealButton = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null)
  const [password, setPassword] = useState('')
  const editorApi = useRef<EditorApi | null>(null)
  // A diagram asked for while the editor isn't mounted yet (e.g. from Read mode via the palette).
  const pendingInsert = useRef<DiagramTemplate | null>(null)

  // The latest text, for work that outlives a render: the unmount flush and in-flight generation.
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
    const timer = setTimeout(() => {
      saveDraft(text)
      setSaved(true)
    }, DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  // Leaving the editor (e.g. opening a link) cancels the pending debounce, so save right away.
  useEffect(() => () => saveDraft(latest.current), [])

  function edit(next: string) {
    setText(next)
    setSaved(false)
    setShared(null) // a link for the previous text would be misleading
  }

  async function openFile(file: File, via: 'picker' | 'drop') {
    setFileProblem(null)
    if (!TEXT_FILE.test(file.name) && !file.type.startsWith('text/') && file.type !== '') {
      setFileProblem('not-text')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileProblem('too-large')
      return
    }
    let content: string
    try {
      // Strict UTF-8 plus a NUL check: an unknown extension with no type may well be binary.
      content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      if (content.includes('\0')) throw new Error('binary')
    } catch {
      setFileProblem('not-text')
      return
    }
    if (text.trim() !== '' && text !== content && !window.confirm(t('editor.replaceText'))) return
    track('file_opened', { via })
    if (mode === 'read') setMode(splitAvailable ? 'split' : 'write')
    edit(content)
  }

  function insertDiagram(template: DiagramTemplate) {
    if (!editorApi.current) {
      pendingInsert.current = template
      return
    }
    track('diagram_inserted', { type: template.name })
    editorApi.current.insert(`\n\`\`\`mermaid\n${template.source}\n\`\`\`\n`)
  }

  // Scroll sync in split mode, both ways. Each side ignores the one scroll event it causes on
  // the other, so they never chase each other.
  const previewScrolledByUs = useRef(false)

  function followEditor(line: number) {
    const pane = previewPane.current
    const target = pane && syncTarget(pane, line)
    if (!pane || !target) return
    const offset = target.getBoundingClientRect().top - pane.getBoundingClientRect().top
    if (Math.abs(offset - 8) < 1) return
    previewScrolledByUs.current = true
    pane.scrollTop = pane.scrollTop + offset - 8
  }

  function followPreview() {
    if (previewScrolledByUs.current) {
      previewScrolledByUs.current = false
      return
    }
    if (mode !== 'split' || !syncScroll || !previewPane.current) return
    const line = lineAtTop(previewPane.current)
    if (line !== null) editorApi.current?.scrollToLine(line)
  }

  // Stable, so the dialog's keyboard and focus effect runs once per opening.
  const closeSeal = useCallback(() => {
    setShared(null)
    sealButton.current?.focus()
  }, [])

  function downloadMarkdown() {
    track('export', { format: 'md' })
    downloadBlob(new Blob([text], { type: 'text/markdown' }), 'document.md')
  }

  // Prints the rendered document in light colors: switch to Read, render light, print, restore.
  async function exportPdf() {
    track('export', { format: 'pdf' })
    const previousMode = mode
    flushSync(() => setMode('read'))
    const article = document.querySelector<HTMLElement>('.read-view .markdown-body')
    const root = document.documentElement
    const previousTheme = root.dataset.theme
    root.dataset.theme = 'light'
    if (article) await hydrate(article, 'light')
    try {
      window.print()
    } finally {
      root.dataset.theme = previousTheme
      if (article) await hydrate(article, theme)
      setMode(previousMode)
    }
  }

  async function generate() {
    setBusy(true)
    const source = text
    try {
      const result = await createLink(source, {
        storage: defaultStorage,
        baseUrl: window.location.origin + import.meta.env.BASE_URL,
        password: password || undefined,
      })
      // Edited while the link was being made: that link is for a version that no longer exists.
      if (latest.current !== source) return
      const types = diagramTypes(source)
      track('link_created', {
        result: result.kind === 'too-large' ? 'too_large' : result.kind,
        storage: result.kind !== 'too-large' && /#\/[sq]\//.test(result.url) ? 'stored' : 'inline',
        protected: password !== '',
        size_kb: Math.round(new Blob([source]).size / 1024),
        diagram_count: types.length,
        diagram_types: types,
      })
      if (result.kind === 'too-large') {
        setShared({ kind: 'too-large' })
        return
      }
      let copied = false
      try {
        await navigator.clipboard.writeText(result.url)
        copied = true
      } catch {
        // Clipboard blocked or unavailable: the link is still shown for manual copying.
      }
      setShared({
        kind: 'link',
        url: result.url,
        fallback: result.kind === 'fallback',
        copied,
        protected: password !== '',
        stored: /#\/[sq]\//.test(result.url),
      })
    } catch {
      if (latest.current === source) {
        track('link_created', { result: 'failed', protected: password !== '' })
        setShared({ kind: 'failed' })
      }
    } finally {
      setBusy(false)
    }
  }

  useCommands('editor', [
    ...MODES.filter((name) => name !== 'split' || splitAvailable).map((name) => ({
      id: `mode-${name}`,
      label: t('palette.mode', { mode: t(`editor.${name}`) }),
      run: () => setMode(name),
    })),
    { id: 'seal', label: t('seal.button'), run: () => text.trim() !== '' && !busy && void generate() },
    { id: 'open', label: t('editor.openFile'), run: () => fileInput.current?.click() },
    { id: 'export-md', label: t('export.md'), run: downloadMarkdown },
    { id: 'export-pdf', label: t('export.pdf'), run: () => void exportPdf() },
    ...TEMPLATES.map((template) => ({
      id: `insert-${template.slug}`,
      label: t('palette.insert', { name: template.name }),
      run: () => {
        if (mode === 'read') setMode(splitAvailable ? 'split' : 'write')
        insertDiagram(template)
      },
    })),
  ])

  return (
    <section className="editor">
      <HeaderSlot name="center">
        <div role="tablist" className="tabs" aria-label={t('editor.modes')}>
          {MODES.filter((name) => name !== 'split' || splitAvailable).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={mode === name}
              className={mode === name ? 'tab active' : 'tab'}
              onClick={() => {
                if (mode !== name) track('mode_changed', { mode: name })
                setMode(name)
              }}
            >
              {t(`editor.${name}`)}
            </button>
          ))}
        </div>
      </HeaderSlot>
      <HeaderSlot name="actions">
        <label className="header-button file-button">
          <Folder />
          <span className="header-button-label">{t('editor.open')}</span>
          <input
            ref={fileInput}
            type="file"
            aria-label={t('editor.openFile')}
            accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file, 'picker')
            }}
          />
        </label>
        <ExportMenu
          items={[
            { id: 'md', label: t('export.md'), run: downloadMarkdown },
            { id: 'pdf', label: t('export.pdf'), run: () => void exportPdf() },
          ]}
        />
        <div className="seal-controls">
          <input
            type="password"
            className="password-input"
            aria-label={t('password.label')}
            placeholder={t('seal.passwordPlaceholder')}
            autoComplete="new-password"
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            ref={sealButton}
            type="button"
            className="primary seal-button"
            disabled={busy || text.trim() === ''}
            onClick={generate}
          >
            <Lock />
            {t(busy ? 'seal.sealing' : 'seal.button')}
          </button>
        </div>
      </HeaderSlot>

      {fileProblem && (
        <div className="notice" role="alert">
          <p>{t(fileProblem === 'not-text' ? 'editor.fileNotText' : 'editor.fileTooLarge')}</p>
        </div>
      )}
      {shared && (
        <SealModal result={shared} onClose={closeSeal} />
      )}

      {mode !== 'read' && (
        <Toolbar
          onApply={(build) => editorApi.current?.apply(build)}
          onUsed={(id) => track('format_applied', { format: id })}
        >
          <DiagramPicker theme={theme} onPick={insertDiagram} />
        </Toolbar>
      )}
      <div className={mode === 'split' ? 'editor-main split' : 'editor-main'}>
        {mode !== 'read' && (
          <div
            className="editor-drop"
            // Capture phase: CodeMirror would otherwise insert a dropped file's text at the drop point.
            onDragOverCapture={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault()
            }}
            onDropCapture={(e) => {
              const file = e.dataTransfer.files[0]
              if (!file) return
              e.preventDefault()
              e.stopPropagation()
              void openFile(file, 'drop')
            }}
          >
            <Suspense fallback={<p className="status editor-loading">{t('editor.loading')}</p>}>
              <CodeEditor
                value={text}
                onChange={edit}
                label={t('editor.placeholder')}
                onReady={(api) => {
                editorApi.current = api
                const pending = pendingInsert.current
                if (api && pending) {
                  pendingInsert.current = null
                  // After the mount commit: the new editor first syncs to the current text.
                  requestAnimationFrame(() => insertDiagram(pending))
                }
              }}
                onScrollLine={mode === 'split' && syncScroll ? followEditor : undefined}
              />
            </Suspense>
          </div>
        )}
        {mode !== 'write' && (
          <div
            className={mode === 'split' ? 'preview-pane' : 'read-view'}
            ref={previewPane}
            onScroll={mode === 'split' ? followPreview : undefined}
          >
            {text.trim() === '' ? (
              <p className="status">{t('editor.empty')}</p>
            ) : (
              <Preview text={text} theme={theme} withToc={mode === 'read'} />
            )}
          </div>
        )}
      </div>
      {mode !== 'read' && (
        <StatusBar
          text={text}
          saved={saved}
          syncScroll={mode === 'split' ? syncScroll : undefined}
          onSyncScrollChange={setSyncScroll}
        />
      )}
    </section>
  )
}

function Preview({ text, theme, withToc }: { text: string; theme: Theme; withToc: boolean }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  // DOMParser documents don't fetch images, unlike a detached element.
  const toc = useMemo(
    () => (withToc ? extractToc(new DOMParser().parseFromString(html, 'text/html').body) : []),
    [html, withToc],
  )
  if (!withToc) return <MarkdownView html={html} theme={theme} />
  return (
    <div className={toc.length >= TOC_MIN_ENTRIES ? 'reader-body with-toc' : 'reader-body'}>
      <Toc entries={toc} />
      <div className="reader-sheet">
        <MarkdownView html={html} theme={theme} />
      </div>
    </div>
  )
}
