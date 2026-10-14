import { EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { parseDiagram } from '../render/mermaid.ts'
import { editorExtensions, insertAtCursor } from './codemirror.ts'
import { mermaidLinter } from './mermaidLint.ts'

export type EditorApi = {
  insert(text: string): void
  apply(build: (state: EditorState) => TransactionSpec): void
}

type Props = {
  value: string
  onChange: (text: string) => void
  label: string
  onReady?: (api: EditorApi) => void
  /** Called with the 1-based line at the top of the editor's viewport while it scrolls. */
  onScrollLine?: (line: number) => void
}

/** CodeMirror, loaded as its own chunk (see EditorPage). Controlled: external value changes replace the document. */
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
        extensions: editorExtensions(label, (text) => onChangeRef.current(text), [mermaidLinter(parseDiagram)]),
      }),
    })
    view.current = editor
    onReady?.({
      insert: (text) => insertAtCursor(editor, text),
      apply: (build) => {
        editor.dispatch({ ...build(editor.state), scrollIntoView: true })
        editor.focus()
      },
    })
    const onScroll = () => {
      const block = editor.lineBlockAtHeight(editor.scrollDOM.scrollTop)
      onScrollLineRef.current?.(editor.state.doc.lineAt(block.from).number)
    }
    editor.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      editor.scrollDOM.removeEventListener('scroll', onScroll)
      editor.destroy()
      view.current = null
    }
    // The editor is created once; later value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={parent} className="code-editor" />
}
