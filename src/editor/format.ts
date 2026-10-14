import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'

/**
 * Markdown formatting as pure functions of the editor state: each returns the transaction that
 * applies (or removes) a format, so toolbar buttons, shortcuts and the command palette share it.
 */

export type InlineMarker = '**' | '*' | '~~' | '`'
export type LineKind = 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'task' | 'quote'
export type BlockKind = 'code' | 'table' | 'math' | 'divider' | 'link' | 'image'

/** Wraps the selection in `marker`, or unwraps it when already wrapped. */
export function toggleInline(state: EditorState, marker: InlineMarker, placeholder: string): TransactionSpec {
  const { from, to } = state.selection.main
  const doc = state.doc
  const m = marker.length
  const selected = doc.sliceString(from, to)

  // Markers just outside the selection.
  if (from >= m && doc.sliceString(from - m, from) === marker && doc.sliceString(to, to + m) === marker) {
    return {
      changes: [
        { from: from - m, to: from, insert: '' },
        { from: to, to: to + m, insert: '' },
      ],
      selection: EditorSelection.range(from - m, to - m),
    }
  }
  // Markers inside the selection.
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m)
    return { changes: { from, to, insert: inner }, selection: EditorSelection.range(from, from + inner.length) }
  }
  const text = selected || placeholder
  return {
    changes: { from, to, insert: marker + text + marker },
    selection: EditorSelection.range(from + m, from + m + text.length),
  }
}

const PREFIX = /^(#{1,6} |> |\s*(?:[-*+] (?:\[[ xX]\] )?|\d+\. ))/

function prefixFor(kind: LineKind, index: number): string {
  switch (kind) {
    case 'h1':
      return '# '
    case 'h2':
      return '## '
    case 'h3':
      return '### '
    case 'ul':
      return '- '
    case 'ol':
      return `${index + 1}. `
    case 'task':
      return '- [ ] '
    case 'quote':
      return '> '
  }
}

function kindOf(prefix: string): LineKind | null {
  if (prefix === '# ') return 'h1'
  if (prefix === '## ') return 'h2'
  if (prefix === '### ') return 'h3'
  if (prefix === '> ') return 'quote'
  if (/\[[ xX]\] $/.test(prefix)) return 'task'
  if (/^\s*\d+\. $/.test(prefix)) return 'ol'
  if (/^\s*[-*+] $/.test(prefix)) return 'ul'
  return null
}

/** Applies a heading, list or quote prefix to every selected line; the same kind again removes it. */
export function toggleLinePrefix(state: EditorState, kind: LineKind): TransactionSpec {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  const lines = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i))
  const allSame = lines.every((line) => kindOf(PREFIX.exec(line.text)?.[1] ?? '') === kind)
  const changes = lines.map((line, index) => {
    const existing = PREFIX.exec(line.text)?.[1] ?? ''
    return { from: line.from, to: line.from + existing.length, insert: allSame ? '' : prefixFor(kind, index) }
  })
  const changeSet = state.changes(changes)
  const single = from === to
  return {
    changes: changeSet,
    // A cursor stays on its text; a selection grows to cover the whole edited lines.
    selection: single
      ? EditorSelection.cursor(changeSet.mapPos(from, 1))
      : EditorSelection.range(changeSet.mapPos(lines[0].from, -1), changeSet.mapPos(lines[lines.length - 1].to, 1)),
  }
}

/** Text needed before an insertion so a block starts on its own line after a blank line. */
function blockLead(state: EditorState, at: number): string {
  const before = state.doc.sliceString(Math.max(0, at - 2), at)
  if (at === 0 || before === '\n\n') return ''
  return before.endsWith('\n') ? '\n' : '\n\n'
}

/** Inserts a block (or a link/image) at the selection. */
export function insertBlock(state: EditorState, kind: BlockKind): TransactionSpec {
  const { from, to } = state.selection.main
  const selected = state.doc.sliceString(from, to)
  const lead = blockLead(state, from)

  const place = (text: string, selectFrom: number, selectTo: number): TransactionSpec => ({
    changes: { from, to, insert: text },
    selection: EditorSelection.range(from + selectFrom, from + selectTo),
  })

  switch (kind) {
    case 'link': {
      const label = selected || 'link'
      const text = `[${label}](https://)`
      const urlStart = label.length + 3
      return selected ? place(text, urlStart, urlStart + 8) : place(text, 1, 1 + label.length)
    }
    case 'image': {
      const alt = selected || 'description'
      const text = `![${alt}](https://)`
      return place(text, 2, 2 + alt.length)
    }
    case 'code': {
      const text = `${lead}\`\`\`\n${selected}\n\`\`\`\n`
      const start = lead.length + 4
      return place(text, start, start + selected.length)
    }
    case 'math': {
      const text = `${lead}$$\n${selected}\n$$\n`
      const start = lead.length + 3
      return place(text, start, start + selected.length)
    }
    case 'table': {
      const text = `${lead}| Column | Column |\n| --- | --- |\n| Cell | Cell |\n`
      const start = lead.length + 2
      return place(text, start, start + 6)
    }
    case 'divider': {
      const text = `${lead}---\n`
      return place(text, text.length, text.length)
    }
  }
}
