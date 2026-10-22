import * as Y from 'yjs'

/** The shared text of a Markdown live document. */
export const TEXT = 'md'

/**
 * The Yjs update that turns an empty document into `text`, the same in every browser: it is
 * written by a scratch document with client id 0. Two browsers that each seed a document from the
 * same stored text (a document from before real-time editing) produce identical updates, which
 * merge into one copy instead of two.
 */
export function seedUpdate(text: string): Uint8Array {
  const scratch = new Y.Doc()
  scratch.clientID = 0
  scratch.getText(TEXT).insert(0, text)
  return Y.encodeStateAsUpdate(scratch)
}
