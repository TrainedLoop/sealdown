import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { parseDiagram } from '../render/mermaid.ts'
import { editorExtensions, insertAtCursor } from './codemirror.ts'
import { mermaidLinter } from './mermaidLint.ts'

export type EditorApi = { insert(text: string): void }

type Props = {
  value: string
  onChange: (text: string) => void
  label: string
  onReady?: (api: EditorApi) => void
}

/** CodeMirror, loaded as its own chunk (see EditorPage). Controlled: external value changes replace the document. */
export default function CodeEditor({ value, onChange, label, onReady }: Props) {
  const parent = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions(label, (text) => onChangeRef.current(text), [mermaidLinter(parseDiagram)]),
      }),
    })
    view.current = editor
    onReady?.({ insert: (text) => insertAtCursor(editor, text) })
    return () => {
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
