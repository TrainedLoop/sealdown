import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { insertBlock, toggleInline, toggleLinePrefix } from '../../../src/editor/format.ts'

/** `|` marks the cursor; `[` and `]` mark a selection. */
function state(marked: string): EditorState {
  const from = marked.includes('[') ? marked.indexOf('[') : marked.indexOf('|')
  const doc = marked.replace(/[[\]|]/g, '')
  const to = marked.includes(']') ? marked.indexOf(']') - 1 : from
  return EditorState.create({ doc, selection: EditorSelection.range(from, to) })
}

function apply(s: EditorState, spec: TransactionSpec): string {
  const next = s.update(spec).state
  const { from, to } = next.selection.main
  const doc = next.doc.toString()
  return from === to ? doc.slice(0, from) + '|' + doc.slice(from) : doc.slice(0, from) + '[' + doc.slice(from, to) + ']' + doc.slice(to)
}

describe('inline styles', () => {
  test('wrap the selection', () => {
    const s = state('a [word] b')
    expect(apply(s, toggleInline(s, '**', 'bold'))).toBe('a **[word]** b')
  })
  test('unwrap when already wrapped (selection inside markers)', () => {
    const s = state('a **[word]** b')
    expect(apply(s, toggleInline(s, '**', 'bold'))).toBe('a [word] b')
  })
  test('unwrap when the selection includes the markers', () => {
    const s = state('a [**word**] b')
    expect(apply(s, toggleInline(s, '**', 'bold'))).toBe('a [word] b')
  })
  test('empty selection inserts a selected placeholder', () => {
    const s = state('a | b')
    expect(apply(s, toggleInline(s, '`', 'code'))).toBe('a `[code]` b')
  })
  test('works at the document edges', () => {
    const s = state('[edge]')
    expect(apply(s, toggleInline(s, '~~', 'struck'))).toBe('~~[edge]~~')
  })
})

describe('line prefixes', () => {
  test('heading on the current line', () => {
    const s = state('Tit|le')
    expect(apply(s, toggleLinePrefix(s, 'h2'))).toBe('## Tit|le')
  })
  test('switching heading level replaces the prefix', () => {
    const s = state('## Tit|le')
    expect(apply(s, toggleLinePrefix(s, 'h1'))).toBe('# Tit|le')
  })
  test('same heading toggles off', () => {
    const s = state('## Tit|le')
    expect(apply(s, toggleLinePrefix(s, 'h2'))).toBe('Tit|le')
  })
  test('bulleted list on every selected line', () => {
    const s = state('[one\ntwo\nthree]')
    expect(apply(s, toggleLinePrefix(s, 'ul'))).toBe('[- one\n- two\n- three]')
  })
  test('numbered list numbers the lines', () => {
    const s = state('[one\ntwo]')
    expect(apply(s, toggleLinePrefix(s, 'ol'))).toBe('[1. one\n2. two]')
  })
  test('task list replaces a bullet', () => {
    const s = state('- it|em')
    expect(apply(s, toggleLinePrefix(s, 'task'))).toBe('- [ ] it|em')
  })
  test('quote toggles off', () => {
    const s = state('> quo|ted')
    expect(apply(s, toggleLinePrefix(s, 'quote'))).toBe('quo|ted')
  })
})

describe('blocks', () => {
  test('code block on its own lines with the cursor inside', () => {
    const s = state('text|')
    expect(apply(s, insertBlock(s, 'code'))).toBe('text\n\n```\n|\n```\n')
  })
  test('code block wraps a selection', () => {
    const s = state('[let a = 1]')
    expect(apply(s, insertBlock(s, 'code'))).toBe('```\n[let a = 1]\n```\n')
  })
  test('divider', () => {
    const s = state('text|')
    expect(apply(s, insertBlock(s, 'divider'))).toBe('text\n\n---\n|')
  })
  test('table template', () => {
    const s = state('|')
    expect(apply(s, insertBlock(s, 'table'))).toBe('| [Column] | Column |\n| --- | --- |\n| Cell | Cell |\n')
  })
  test('math block', () => {
    const s = state('|')
    expect(apply(s, insertBlock(s, 'math'))).toBe('$$\n|\n$$\n')
  })
  test('link wraps the selection and selects the URL', () => {
    const s = state('see [docs] here')
    expect(apply(s, insertBlock(s, 'link'))).toBe('see [docs]([https://]) here')
  })
  test('image with an empty selection', () => {
    const s = state('|')
    expect(apply(s, insertBlock(s, 'image'))).toBe('![[description]](https://)')
  })
})
