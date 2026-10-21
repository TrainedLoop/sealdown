import { EditorState, Transaction, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { minimalChange } from './minimalChange.ts'
import { parseDiagram } from '../render/mermaid.ts'
import { hintMessage } from '../render/hintMessage.ts'
import { editorExtensions, insertAtCursor } from './codemirror.ts'
import { mermaidLinter } from './mermaidLint.ts'

export type EditorApi = {
  insert(text: string): void
  /** Puts a 1-based line at the top of the viewport (programmatic: not reported via onScrollLine). */
  scrollToLine(line: number): void
  apply(build: (state: EditorState) => TransactionSpec): void
}

type Props = {
  value: string
  onChange: (text: string) => void
  label: string
  /** Called with the API once the editor exists, and with null when it is destroyed. */
  onReady?: (api: EditorApi | null) => void
  /** Called with the 1-based line at the top of the editor's viewport while it scrolls. */
  onScrollLine?: (line: number) => void
}

/** CodeMirror, loaded as its own chunk (see EditorPage). Controlled: external value changes are applied as the smallest edit. */
export default function CodeEditor({ value, onChange, label, onReady, onScrollLine }: Props) {
  const parent = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onScrollLineRef = useRef(onScrollLine)
  useEffect(() => {
    onChangeRef.current = onChange
    onScrollLineRef.current = onScrollLine
  }, [onChange, onScrollLine])

  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions(label, (text) => onChangeRef.current(text), [mermaidLinter(parseDiagram, hintMessage)]),
      }),
    })
    view.current = editor
    onReady?.({
      insert: (text) => insertAtCursor(editor, text),
      scrollToLine: (line) => {
        const doc = editor.state.doc
        const target = editor.lineBlockAt(doc.line(Math.min(Math.max(line, 1), doc.lines)).from).top
        if (Math.abs(editor.scrollDOM.scrollTop - target) < 1) return
        programmatic = true
        editor.scrollDOM.scrollTop = target
      },
      apply: (build) => {
        editor.dispatch({ ...build(editor.state), scrollIntoView: true })
        editor.focus()
      },
    })
    // Scrolls we cause ourselves (following the preview) must not be echoed back to it.
    let programmatic = false
    const onScroll = () => {
      if (programmatic) {
        programmatic = false
        return
      }
      const block = editor.lineBlockAtHeight(editor.scrollDOM.scrollTop)
      onScrollLineRef.current?.(editor.state.doc.lineAt(block.from).number)
    }
    editor.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      editor.scrollDOM.removeEventListener('scroll', onScroll)
      onReady?.(null)
      editor.destroy()
      view.current = null
    }
    // The editor is created once; later value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = view.current
    // Only the part that changed: text arriving from elsewhere (a live document) keeps the cursor.
    const change = editor && minimalChange(editor.state.doc.toString(), value)
    if (editor && change) editor.dispatch({ changes: change, annotations: Transaction.addToHistory.of(false) })
  }, [value])

  return <div ref={parent} className="code-editor" />
}
