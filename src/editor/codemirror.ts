import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { toggleInline } from './format.ts'
import { tags as t } from '@lezer/highlight'
import { minimalSetup } from 'codemirror'

// Colors come from the page's CSS variables, so the editor follows the light/dark theme.
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--text)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--code-text)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator, t.labelName], color: 'var(--muted)' },
])

const theme = EditorView.theme({
  // Fills its pane: long documents scroll inside the editor instead of growing the page.
  '&': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    height: '100%',
    fontSize: '0.92rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
  '.cm-content': { padding: '1rem 0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 1rem 0 0.75rem' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none', paddingLeft: '0.5rem' },
  '.cm-lineNumbers .cm-gutterElement': { fontSize: '0.8em', minWidth: '2ch' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--code-bg) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '.cm-placeholder': { color: 'var(--muted)' },
})

export function editorExtensions(label: string, onChange: (text: string) => void, extra: import('@codemirror/state').Extension[] = []) {
  return [
    minimalSetup,
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    markdown(),
    syntaxHighlighting(highlight),
    EditorView.lineWrapping,
    // High precedence: CodeMirror's default keymap binds Mod-i to "select parent syntax".
    Prec.high(
      keymap.of([
        { key: 'Mod-b', run: (view) => (view.dispatch(toggleInline(view.state, '**', 'bold')), true) },
        { key: 'Mod-i', run: (view) => (view.dispatch(toggleInline(view.state, '*', 'italic')), true) },
      ]),
    ),
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    placeholder(label),
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString())
    }),
    ...extra,
  ]
}

/** Inserts text at the cursor (replacing any selection) and focuses the editor. */
export function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true })
  view.focus()
}
