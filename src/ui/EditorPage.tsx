import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { diagramTypes, track } from '../analytics.ts'
import type { EditorApi } from '../editor/CodeEditor.tsx'
import { diagramTemplates } from '../editor/templates.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { createLink } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { loadDraft, saveDraft } from './draft.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import { QrCode } from './QrCode.tsx'
import type { Theme } from './theme.ts'

type Tab = 'code' | 'preview'

type Shared =
  | { kind: 'link'; url: string; fallback: boolean; copied: boolean }
  | { kind: 'too-large' }
  | { kind: 'failed' }

const DRAFT_DELAY_MS = 500

const CodeEditor = lazy(() => import('../editor/CodeEditor.tsx'))

const MAX_FILE_BYTES = 5 * 1024 * 1024
const TEXT_FILE = /\.(md|markdown|mdown|txt)$/i
const templates = diagramTemplates()

type FileProblem = 'not-text' | 'too-large'

export function EditorPage({ theme }: { theme: Theme }) {
  const { t } = useTranslation()
  const [text, setText] = useState(loadDraft)
  const [tab, setTab] = useState<Tab>('code')
  const [shared, setShared] = useState<Shared | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null)
  const [protect, setProtect] = useState(false)
  const [password, setPassword] = useState('')
  const editorApi = useRef<EditorApi | null>(null)

  // The latest text, for work that outlives a render: the unmount flush and in-flight generation.
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
    const timer = setTimeout(() => saveDraft(text), DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  // Leaving the editor (e.g. opening a link) cancels the pending debounce, so save right away.
  useEffect(() => () => saveDraft(latest.current), [])

  function edit(next: string) {
    setText(next)
    setShared(null) // a link for the previous text would be misleading
  }

  async function openFile(file: File, via: 'picker' | 'drop') {
    setFileProblem(null)
    if (!TEXT_FILE.test(file.name) && !(file.type.startsWith('text/') || file.type === '')) {
      setFileProblem('not-text')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileProblem('too-large')
      return
    }
    const content = await file.text()
    if (text.trim() !== '' && text !== content && !window.confirm(t('editor.replaceText'))) return
    track('file_opened', { via })
    setTab('code')
    edit(content)
  }

  function insertDiagram(name: string) {
    const template = templates.find((item) => item.name === name)
    if (!template || !editorApi.current) return
    track('diagram_inserted', { type: name })
    editorApi.current.insert(`\n\`\`\`mermaid\n${template.source}\n\`\`\`\n`)
  }

  async function generate() {
    setBusy(true)
    const source = text
    try {
      const result = await createLink(source, {
        storage: defaultStorage,
        baseUrl: window.location.origin + import.meta.env.BASE_URL,
        password: protect ? password : undefined,
      })
      // Edited while the link was being made: that link is for a version that no longer exists.
      if (latest.current !== source) return
      const types = diagramTypes(source)
      track('link_created', {
        result: result.kind === 'too-large' ? 'too_large' : result.kind,
        storage: result.kind !== 'too-large' && /#\/[sq]\//.test(result.url) ? 'stored' : 'inline',
        protected: protect,
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
      setShared({ kind: 'link', url: result.url, fallback: result.kind === 'fallback', copied })
    } catch {
      if (latest.current === source) {
        track('link_created', { result: 'failed', protected: protect })
        setShared({ kind: 'failed' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="editor">
      <div className="editor-toolbar">
        <div role="tablist" className="tabs">
          {(['code', 'preview'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'tab active' : 'tab'}
              onClick={() => setTab(name)}
            >
              {t(name === 'code' ? 'editor.code' : 'editor.preview')}
            </button>
          ))}
        </div>
        <div className="editor-tools">
          {tab === 'code' && (
            <select
              aria-label={t('editor.insertDiagram')}
              value=""
              onChange={(e) => insertDiagram(e.target.value)}
            >
              <option value="">{t('editor.insertDiagram')}</option>
              {templates.map((template) => (
                <option key={template.name} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          )}
          <label className="file-button">
            {t('editor.openFile')}
            <input
              type="file"
              accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void openFile(file, 'picker')
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className="primary"
          disabled={busy || text.trim() === '' || (protect && password === '')}
          onClick={generate}
        >
          {t(busy ? 'editor.generating' : 'editor.generate')}
        </button>
      </div>

      <div className="protect">
        <label>
          <input
            type="checkbox"
            checked={protect}
            onChange={(e) => {
              setProtect(e.target.checked)
              setShared(null)
            }}
          />
          {t('password.protect')}
        </label>
        {protect && (
          <label>
            {t('password.label')}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setShared(null)
              }}
            />
          </label>
        )}
      </div>

      {fileProblem && (
        <div className="notice" role="alert">
          <p>{t(fileProblem === 'not-text' ? 'editor.fileNotText' : 'editor.fileTooLarge')}</p>
        </div>
      )}
      {shared?.kind === 'too-large' && <ErrorMessage kind="too-large" />}
      {shared?.kind === 'failed' && <ErrorMessage kind="generate-failed" />}
      {shared?.kind === 'link' && (
        <div className="share-result">
          {shared.fallback && <ErrorMessage kind="storage-unavailable" />}
          <p role="status">{t(shared.copied ? 'editor.copied' : 'editor.copyManually')}</p>
          <input
            data-testid="share-url"
            aria-label={t('editor.shareUrl')}
            readOnly
            value={shared.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <QrCode key={shared.url} url={shared.url} />
        </div>
      )}

      {tab === 'code' ? (
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
              onReady={(api) => (editorApi.current = api)}
            />
          </Suspense>
        </div>
      ) : text.trim() === '' ? (
        <p className="status">{t('editor.empty')}</p>
      ) : (
        <Preview text={text} theme={theme} />
      )}
    </section>
  )
}

function Preview({ text, theme }: { text: string; theme: Theme }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return <MarkdownView html={html} theme={theme} />
}
