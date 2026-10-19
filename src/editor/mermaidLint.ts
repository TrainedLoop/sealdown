import { linter, type Diagnostic } from '@codemirror/lint'
import { mermaidHint, type MermaidHint } from '../render/mermaidHints.ts'

export type MermaidBlock = { from: number; to: number; bodyFrom: number; source: string }

/** ```mermaid fences in a Markdown document, with offsets; unterminated fences are ignored. */
export function findMermaidBlocks(doc: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = []
  const fence = /^```mermaid[^\S\n]*\n([\s\S]*?)^```[^\S\n]*$/gm
  for (const match of doc.matchAll(fence)) {
    const from = match.index
    const bodyFrom = from + match[0].indexOf('\n') + 1
    blocks.push({ from, to: from + match[0].length, bodyFrom, source: match[1].replace(/\n$/, '') })
  }
  return blocks
}

/** 1-based line of a Mermaid parse error within its block, when the error says. */
export function errorLine(error: unknown): number | null {
  const hash = (error as { hash?: { loc?: { first_line?: number }; line?: number } })?.hash
  if (typeof hash?.loc?.first_line === 'number') return hash.loc.first_line
  if (typeof hash?.line === 'number') return hash.line + 1
  const message = error instanceof Error ? error.message : String(error)
  const match = /\bline (\d+)/i.exec(message)
  return match ? Number(match[1]) : null
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n').filter((line) => !/^-+\^$/.test(line.trim())).join('\n').trim()
}

/** Underlines Mermaid syntax errors. Mermaid is loaded only once a document has a diagram. */
export function mermaidLinter(parse: (source: string) => Promise<void>, describe: (hint: MermaidHint) => string) {
  return linter(
    async (view) => {
      const doc = view.state.doc.toString()
      const diagnostics: Diagnostic[] = []
      for (const block of findMermaidBlocks(doc)) {
        const bodyLines = block.source.split('\n')
        const range = (line: number | null) => {
          if (line === null || line < 1 || line > bodyLines.length) return { from: block.from, to: block.bodyFrom - 1 }
          const from = block.bodyFrom + bodyLines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
          return { from, to: from + Math.max(bodyLines[line - 1].length, 1) }
        }
        const hint = mermaidHint(block.source)
        try {
          await parse(block.source)
          // Parsed, but probably not as the author meant (e.g. braces made a composite state).
          if (hint) diagnostics.push({ ...range(hint.line), severity: 'warning', message: describe(hint) })
        } catch (error) {
          const { from, to } = range(hint ? hint.line : errorLine(error))
          const message = hint ? `${describe(hint)}\n\n${messageOf(error)}` : messageOf(error)
          diagnostics.push({ from, to: Math.min(to, doc.length), severity: 'error', message })
        }
      }
      return diagnostics
    },
    { delay: 600 },
  )
}
