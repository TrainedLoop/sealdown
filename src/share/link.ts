import { buildHash, type Route } from '../router/route.ts'
import { StorageUnavailableError, type DocStorage } from '../storage/storage.ts'
import { base64urlDecode, base64urlEncode } from './base64url.ts'
import { compress, decompress } from './codec.ts'
import { decrypt, encrypt } from './crypto.ts'
import { LinkError } from './errors.ts'

/** Largest encoded payload kept in the URL; anything bigger is encrypted and stored. */
export const INLINE_LIMIT = 4096
/** Largest encrypted document accepted by storage (mirrors the database constraint). */
export const MAX_STORED_BYTES = 1048576

export type CreateLinkResult = { kind: 'ok'; url: string } | { kind: 'fallback'; url: string } | { kind: 'too-large' }

export async function createLink(text: string, opts: { storage: DocStorage; baseUrl: string }): Promise<CreateLinkResult> {
  const compressed = await compress(text)
  const payload = base64urlEncode(compressed)
  const inlineUrl = opts.baseUrl + buildHash({ kind: 'inline', payload })
  if (payload.length <= INLINE_LIMIT) return { kind: 'ok', url: inlineUrl }

  const { bytes, key } = await encrypt(compressed)
  if (bytes.length > MAX_STORED_BYTES) return { kind: 'too-large' }
  try {
    const id = await opts.storage.save(bytes)
    return { kind: 'ok', url: opts.baseUrl + buildHash({ kind: 'stored', id, key }) }
  } catch (error) {
    if (error instanceof StorageUnavailableError) return { kind: 'fallback', url: inlineUrl }
    throw error
  }
}

export async function openRoute(route: Extract<Route, { kind: 'inline' | 'stored' }>, storage: DocStorage): Promise<string> {
  if (route.kind === 'inline') return decompress(base64urlDecode(route.payload))

  let bytes: Uint8Array | null
  try {
    bytes = await storage.load(route.id)
  } catch (cause) {
    if (cause instanceof StorageUnavailableError) throw new LinkError('network', { cause })
    throw cause
  }
  if (bytes === null) throw new LinkError('expired')
  return decompress(await decrypt(bytes, route.key))
}
