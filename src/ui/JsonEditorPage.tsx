import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import { useCommands } from './commands.ts'
import { useDocumentTitle } from './docTitle.ts'
import { downloadBlob } from './download.ts'
import { ExportMenu } from './ExportMenu.tsx'
import { HeaderSlot } from './headerSlots.tsx'
import { Folder } from './icons.tsx'
import { loadJsonDraft, saveJsonDraft } from './jsonDraft.ts'
import { useSplitAvailable } from './mode.ts'
import { readTextFile, type FileProblem } from './readTextFile.ts'
import { SealControls } from './SealControls.tsx'
import { SealModal } from './SealModal.tsx'
import { useSealLink } from './useSealLink.ts'

import type { JsonEditorApi } from '../json/JsonEditor.tsx'

const JsonEditor = lazy(() => import('../json/JsonEditor.tsx'))

const DRAFT_DELAY_MS = 500
const JSON_FILE = /\.json$/i
const PANES = ['text', 'tree'] as const
type Pane = (typeof PANES)[number]

/** Text on the left, tree on the right, kept in sync through the text. Tabs on narrow screens. */
export function JsonEditorPage() {
  const { t } = useTranslation()
  const [text, setText] = useState(loadJsonDraft)
  const wide = useSplitAvailable()
  const [pane, setPane] = useState<Pane>('text')
  const seal = useSealLink(text, 'json')
  const fileInput = useRef<HTMLInputElement>(null)
  const textPane = useRef<JsonEditorApi | null>(null)
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null)
  useDocumentTitle(null)

  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
    const timer = setTimeout(() => saveJsonDraft(text), DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  // Leaving the editor cancels the pending debounce, so save right away, including the text pane's
  // own pending change.
  useEffect(() => () => saveJsonDraft(textPane.current?.getText() ?? latest.current), [])

  function edit(next: string) {
    if (next === latest.current) return
    setText(next)
    seal.clearSeal()
  }

  async function openFile(file: File, via: 'picker' | 'drop') {
    setFileProblem(null)
    const read = await readTextFile(file, JSON_FILE)
    if ('problem' in read) {
      setFileProblem(read.problem)
      return
    }
    if (text.trim() !== '' && text.trim() !== '{}' && text !== read.text && !window.confirm(t('json.replaceText'))) return
    track('file_opened', { via, doc_type: 'json' })
    edit(read.text)
  }

  // The text pane reports edits after a short pause; seal what is on screen, not the last report.
  function sealNow() {
    const current = textPane.current?.getText() ?? latest.current
    if (current.trim() === '' || seal.busy) return
    edit(current)
    void seal.generate(current)
  }

  function downloadJson() {
    track('export', { format: 'json' })
    const current = textPane.current?.getText() ?? latest.current
    downloadBlob(new Blob([current], { type: 'application/json' }), 'document.json')
  }

  useCommands('json-editor', [
    { id: 'seal', label: t('seal.button'), run: sealNow },
    { id: 'open', label: t('json.openFile'), run: () => fileInput.current?.click() },
    { id: 'export-json', label: t('export.json'), run: downloadJson },
  ])

  const shown = (name: Pane) => wide || pane === name

  return (
    <section className="json-page">
      {!wide && (
        <HeaderSlot name="center">
          <div role="tablist" className="tabs" aria-label={t('json.panes')}>
            {PANES.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={pane === name}
                className={pane === name ? 'tab active' : 'tab'}
                onClick={() => setPane(name)}
              >
                {t(`json.${name}`)}
              </button>
            ))}
          </div>
        </HeaderSlot>
      )}
      <HeaderSlot name="actions">
        <label className="header-button file-button">
          <Folder />
          <span className="header-button-label">{t('editor.open')}</span>
          <input
            ref={fileInput}
            type="file"
            aria-label={t('json.openFile')}
            accept=".json,application/json,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file, 'picker')
            }}
          />
        </label>
        <ExportMenu items={[{ id: 'json', label: t('export.json'), run: downloadJson }]} />
        <SealControls seal={seal} empty={text.trim() === ''} onSeal={sealNow} />
      </HeaderSlot>

      {fileProblem && (
        <div className="notice" role="alert">
          <p>{t(fileProblem === 'not-text' ? 'json.fileNotText' : 'editor.fileTooLarge')}</p>
        </div>
      )}
      {seal.shared && <SealModal result={seal.shared} onClose={seal.closeSeal} />}

      <div
        className={wide ? 'json-main split' : 'json-main'}
        // Capture phase: the library would otherwise take a dropped file's text itself.
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
        <Suspense fallback={<p className="status editor-loading">{t('json.loading')}</p>}>
          {shown('text') && (
            <div className="json-pane json-text">
              <JsonEditor
                text={text}
                mode="text"
                label={t('json.textLabel')}
                onChange={edit}
                onReady={(api) => (textPane.current = api)}
              />
            </div>
          )}
          {shown('tree') && (
            <div className="json-pane json-tree">
              <JsonEditor text={text} mode="tree" label={t('json.treeLabel')} onChange={edit} />
            </div>
          )}
        </Suspense>
      </div>
    </section>
  )
}
