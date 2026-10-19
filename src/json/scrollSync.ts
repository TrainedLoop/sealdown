import { EditorView } from '@codemirror/view'
import { lineOfPointer, pointerAtLine, type JsonLine } from './jsonLines.ts'

// Split-mode scroll sync between the library's text mode (CodeMirror) and its tree, through the
// JSON pointer of the value at the top of each pane. The tree names rows by data-path.

const TREE_SCROLLER = '.jse-tree-mode > .jse-contents'

// Where the document starts inside the text scroller's content (CodeMirror pads the top).
function documentOffset(view: EditorView): number {
  return view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop
}

function textView(pane: Element): EditorView | null {
  const content = pane.querySelector<HTMLElement>('.cm-content')
  return content ? EditorView.findFromDOM(content) : null
}

export function isTextScroller(el: Element): boolean {
  return el.classList.contains('cm-scroller')
}

export function isTreeScroller(el: Element): boolean {
  return el.matches(TREE_SCROLLER)
}

function findRow(scroller: Element, pointer: string): HTMLElement | null {
  return scroller.querySelector<HTMLElement>(`[data-path="${CSS.escape(encodeURIComponent(pointer))}"]`)
}

function lastRenderedBefore(scroller: Element, pointer: string): HTMLElement | null {
  const slash = pointer.lastIndexOf('/')
  const index = Number(pointer.slice(slash + 1))
  if (slash < 0 || !/^\d+$/.test(pointer.slice(slash + 1))) return null
  const parent = pointer.slice(0, slash)
  for (let i = index - 1; i >= 0; i--) {
    const row = findRow(scroller, `${parent}/${i}`)
    if (row) return row
  }
  return null
}

/** Scrolls the tree to the value at the top of the text; false when nothing moved. */
export function followText(textPane: Element, treePane: Element, lines: JsonLine[]): boolean {
  const view = textView(textPane)
  const scroller = treePane.querySelector<HTMLElement>(TREE_SCROLLER)
  if (!view || !scroller) return false
  const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop - documentOffset(view))
  let pointer = pointerAtLine(lines, view.state.doc.lineAt(top.from).number)
  // Inside a collapsed node the row isn't rendered: stop at the nearest ancestor that is. Long arrays
  // only render their first items (with "show more"): stop at the last rendered one before it.
  let row: HTMLElement | null = null
  while (pointer !== null && !row) {
    row = findRow(scroller, pointer) ?? lastRenderedBefore(scroller, pointer)
    pointer = pointer === '' ? null : pointer.slice(0, pointer.lastIndexOf('/'))
  }
  if (!row) return false
  const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  if (Math.abs(offset) < 1) return false
  scroller.scrollTop += offset
  return true
}

/** Scrolls the text to the value of the first row visible in the tree; false when nothing moved. */
export function followTree(treePane: Element, textPane: Element, lines: JsonLine[]): boolean {
  const view = textView(textPane)
  const scroller = treePane.querySelector<HTMLElement>(TREE_SCROLLER)
  if (!view || !scroller) return false
  const top = scroller.getBoundingClientRect().top
  const row = Array.from(scroller.querySelectorAll<HTMLElement>('[data-path]')).find(
    (el) => el.getBoundingClientRect().top >= top - 1,
  )
  const line = row?.dataset.path === undefined ? null : lineOfPointer(lines, decodeURIComponent(row.dataset.path))
  if (line === null || line > view.state.doc.lines) return false
  const from = view.state.doc.line(line).from
  // Already at the top (measured lines only; far lines have estimated heights).
  if (view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop - documentOffset(view)).from).number === line) return false
  // CodeMirror measures the far lines it only estimated before scrolling.
  view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 0 }) })
  return true
}
