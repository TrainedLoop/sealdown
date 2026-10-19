import { parse, stringify } from 'lossless-json'
import { useEffect, useRef } from 'react'
import { createJSONEditor, Mode, toTextContent, type Content, type JSONParser, type JsonEditor as Instance } from 'vanilla-jsoneditor'
import './json.css'

export type JsonEditorProps = {
  text: string
  mode: 'text' | 'tree'
  readOnly?: boolean
  label: string
  onChange?: (text: string) => void
  /** The editor's current text, which can be ahead of the last `onChange` (text mode debounces it). */
  onReady?: (api: JsonEditorApi | null) => void
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
export default function JsonEditor({ text, mode, readOnly = false, label, onChange, onReady }: JsonEditorProps) {
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
    if (editor.current && currentText(editor.current) !== text) void editor.current.update({ text })
  }, [text])

  useEffect(() => {
    void editor.current?.updateProps({ mode: mode as Mode, readOnly, ariaLabel: label })
  }, [mode, readOnly, label])

  return <div className="json-editor jse-theme-sealdown" ref={target} />
}
