import { deflateRawSync } from 'node:zlib'

/** Builds the `#/v/…` hash for a document, the same way the app encodes inline links. */
export function inlineHash(text: string): string {
  return '#/v/' + deflateRawSync(Buffer.from(text, 'utf8')).toString('base64url')
}
