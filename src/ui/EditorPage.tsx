import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import type { EditorApi } from '../editor/CodeEditor.tsx'
import { DiagramPicker } from '../editor/DiagramPicker.tsx'
import { Toolbar } from '../editor/Toolbar.tsx'
import { diagramTemplates, type DiagramTemplate } from '../editor/templates.ts'
import { useCommands } from './commands.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { lineAtTop, syncTarget } from '../render/scrollSync.ts'
import { loadDraft, saveDraft } from './draft.ts'
import { MarkdownView } from './MarkdownView.tsx'
import { Toc, TOC_MIN_ENTRIES } from './Toc.tsx'
import { extractToc } from '../render/toc.ts'
import { useMode, type Mode } from './mode.ts'
import { readPref, writePref } from './prefs.ts'
import { StatusBar } from './StatusBar.tsx'
import { useDocumentTitle } from './docTitle.ts'
import { SealModal } from './SealModal.tsx'
import { SealControls } from './SealControls.tsx'
import { useSealLink } from './useSealLink.ts'
import { readTextFile, type FileProblem } from './readTextFile.ts'
import { ExportMenu } from './ExportMenu.tsx'
import { HeaderSlot } from './headerSlots.tsx'
import { Folder } from './icons.tsx'
import { downloadBlob } from './download.ts'
import { hydrate } from '../render/hydrate.ts'
import type { Theme } from './theme.ts'

const DRAFT_DELAY_MS = 500
const MODES: Mode[] = ['write', 'split', 'read']
const TEMPLATES = diagramTemplates()

const CodeEditor = lazy(() => import('../editor/CodeEditor.tsx'))

const TEXT_FILE = /\.(md|markdown|mdown|txt)$/i

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
  const seal = useSealLink(text, 'markdown')
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null)
  const editorApi = useRef<EditorApi | null>(null)
  // A diagram asked for while the editor isn't mounted yet (e.g. from Read mode via the palette).
  const pendingInsert = useRef<DiagramTemplate | null>(null)

  // The latest text, for the unmount flush.
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
    seal.clearSeal()
  }

  async function openFile(file: File, via: 'picker' | 'drop') {
    setFileProblem(null)
    const read = await readTextFile(file, TEXT_FILE)
    if ('problem' in read) {
      setFileProblem(read.problem)
      return
    }
    const content = read.text
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

  useCommands('editor', [
    ...MODES.filter((name) => name !== 'split' || splitAvailable).map((name) => ({
      id: `mode-${name}`,
      label: t('palette.mode', { mode: t(`editor.${name}`) }),
      run: () => setMode(name),
    })),
    { id: 'seal', label: t('seal.button'), run: () => text.trim() !== '' && !seal.busy && void seal.generate() },
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
        <SealControls seal={seal} empty={text.trim() === ''} />
      </HeaderSlot>

      {fileProblem && (
        <div className="notice" role="alert">
          <p>{t(fileProblem === 'not-text' ? 'editor.fileNotText' : 'editor.fileTooLarge')}</p>
        </div>
      )}
      {seal.shared && <SealModal result={seal.shared} onClose={seal.closeSeal} />}

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
