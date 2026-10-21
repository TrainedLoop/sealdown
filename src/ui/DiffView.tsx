import { lineDiff } from './lineDiff.ts'

/**
 * What changed from `before` to `after`, line by line: removed lines struck through in red, added
 * ones in green. `context` lines (unchanged, around the change) are shown dimmed.
 */
export function DiffView({ before, after, context }: { before: string; after: string; context?: { before: string[]; after: string[] } }) {
  return (
    <pre className="diff-view">
      {context?.before.map((text, i) => (
        <span key={`b${i}`} className="diff-same diff-context">
          {text}
        </span>
      ))}
      {lineDiff(before, after).map((line, i) => (
        <span key={i} className={`diff-${line.kind}`}>
          {line.text}
        </span>
      ))}
      {context?.after.map((text, i) => (
        <span key={`a${i}`} className="diff-same diff-context">
          {text}
        </span>
      ))}
    </pre>
  )
}
