import { i18n } from '../i18n/index.ts'
import type { MermaidHint } from './mermaidHints.ts'

/** The hint, in the interface language. Braces are passed as values so i18next doesn't read them. */
export function hintMessage(hint: MermaidHint): string {
  return hint.kind === 'semicolon'
    ? i18n.t('hints.semicolon', { line: hint.line })
    : i18n.t('hints.braces', { line: hint.line, open: '{', close: '}' })
}
