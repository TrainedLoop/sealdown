/**
 * Common Mermaid pitfalls whose parser errors don't point at the cause:
 * - in a sequence diagram, `;` ends the statement, even inside a message;
 * - in a state diagram, `{` / `}` open a composite state, even inside a label.
 */
export type MermaidHint = { line: number; kind: 'semicolon' | 'braces' }

const SEQUENCE_TEXT = /^\s*(?:Note\b[^:]*|[^:]*?(?:-->>|->>|--x|-x|--\)|-\)|-->|->)[^:]*):(.*)$/i
const STATE_LABEL = /^\s*[^:]*?-->[^:]*:(.*)$/

export function mermaidHint(source: string): MermaidHint | null {
  const lines = source.split('\n')
  const kind = lines.find((l) => l.trim() !== '')?.trim().split(/\s+/)[0] ?? ''
  for (const [index, line] of lines.entries()) {
    if (kind === 'sequenceDiagram') {
      const text = SEQUENCE_TEXT.exec(line)?.[1]
      if (text && text.replace(/#\d+;/g, '').includes(';')) return { line: index + 1, kind: 'semicolon' }
    }
    if (kind.startsWith('stateDiagram')) {
      const label = STATE_LABEL.exec(line)?.[1]
      if (label && /[{}]/.test(label)) return { line: index + 1, kind: 'braces' }
    }
  }
  return null
}
