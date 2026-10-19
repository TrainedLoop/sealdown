export type DocType = 'markdown' | 'json'
export type Doc = { type: DocType; text: string }

/**
 * Prepended to JSON documents before they are sealed, so the type travels encrypted with the
 * text. Markdown is never marked: its links stay exactly what they were before JSON existed.
 */
export const JSON_MARKER = '\u0001json\n'

export function encodeDoc(doc: Doc): string {
  return doc.type === 'json' ? JSON_MARKER + doc.text : doc.text
}

export function decodeDoc(text: string): Doc {
  return text.startsWith(JSON_MARKER) ? { type: 'json', text: text.slice(JSON_MARKER.length) } : { type: 'markdown', text }
}
