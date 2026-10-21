import { parse, stringify } from 'lossless-json'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { Incoming } from '../editor/incoming.ts'
import { minimalChange } from '../editor/minimalChange.ts'
import { createJSONEditor, Mode, toTextContent, type Content, type JSONParser, type MenuItem, type JsonEditor as Instance } from 'vanilla-jsoneditor'
import './json.css'

export type JsonEditorProps = {
  text: string
  mode: 'text' | 'tree'
  readOnly?: boolean
  /** Keeps the editor in `mode`: no text | tree | table switch, and no way out of it. */
  lockMode?: boolean
  label: string
  onChange?: (text: string) => void
  /** The editor's current text, which can be ahead of the last `onChange` (text mode debounces it). */
  onReady?: (api: JsonEditorApi | null) => void
  /** A live document's text from others (text mode): applied against the text as it is right then. */
  incoming?: Incoming
}

export type JsonEditorApi = { getText: () => string }

// Lossless: numbers keep their exact digits (64-bit ids, 1.10) when the tree reads and writes them.
const PARSER = { parse, stringify } as JSONParser
// Tree edits rewrite the text from the parsed document; keep it readable instead of one long line.
const INDENTATION = 2

function currentText(editor: Instance): string {
  return toTextContent(editor.get(), INDENTATION, PARSER).text
}

/** vanilla-jsoneditor in a React component, themed with the Vault tokens (json.css). */
// The mode switch is the group of buttons at the start of the menu, followed by a separator.
function withoutModeSwitch(items: MenuItem[]): MenuItem[] {
  const rest = items.filter((item) => !('className' in item && item.className?.includes('jse-group-button')))
  return rest[0]?.type === 'separator' ? rest.slice(1) : rest
}

export default function JsonEditor({ text, mode, readOnly = false, lockMode = false, label, onChange, onReady, incoming }: JsonEditorProps) {
  const target = useRef<HTMLDivElement>(null)
  const editor = useRef<Instance | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const instance = createJSONEditor({
      target: target.current!,
      props: {
        content: { text },
        mode: mode as Mode,
        readOnly,
        ariaLabel: label,
        askToFormat: false,
        parser: PARSER,
        ...(lockMode && {
          onRenderMenu: withoutModeSwitch,
          // "Repair manually" in a broken tree switches to text; come back once it's applied.
          onChangeMode: (next: Mode) => next !== mode && void instance.updateProps({ mode: mode as Mode }),
        }),
        indentation: INDENTATION,
        onChange: (content: Content) => onChangeRef.current?.(toTextContent(content, INDENTATION, PARSER).text),
      },
    })
    editor.current = instance
    onReady?.({
      getText: () => {
        // validate() flushes the text mode's pending (debounced) change first.
        instance.validate()
        return currentText(instance)
      },
    })
    return () => {
      onReady?.(null)
      editor.current = null
      void instance.destroy()
    }
    // Created once; later prop changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Our own edits echo back as the same text: leave the editor (and its cursor) alone then.
    if (!editor.current || currentText(editor.current) === text) return
    // In text mode, edit the CodeMirror document directly with the smallest change, so text arriving
    // from elsewhere (a live document) keeps the cursor; the library's update() replaces it all.
    const content = target.current?.querySelector<HTMLElement>('.cm-content')
    const view = mode === 'text' && content ? EditorView.findFromDOM(content) : null
    const change = view && minimalChange(view.state.doc.toString(), text)
    if (view && change) view.dispatch({ changes: change })
    else void editor.current.update({ text })
  }, [text, mode])

  useEffect(() => {
    const content = target.current?.querySelector<HTMLElement>('.cm-content')
    const view = incoming && mode === 'text' && content ? EditorView.findFromDOM(content) : null
    if (!view || !incoming) return
    const current = view.state.doc.toString()
    const next = incoming.rebase(current)
    const change = next === null ? null : minimalChange(current, next)
    // Someone else's change: out of this person's undo history.
    if (change) view.dispatch({ changes: change, annotations: Transaction.addToHistory.of(false) })
    // Applied once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])

  useEffect(() => {
    void editor.current?.updateProps({ mode: mode as Mode, readOnly, ariaLabel: label })
  }, [mode, readOnly, label])

  return <div className="json-editor jse-theme-sealdown" ref={target} />
}
