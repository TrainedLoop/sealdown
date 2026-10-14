import { buildHash, type Route } from '../router/route.ts'
import { StorageUnavailableError, type DocStorage } from '../storage/storage.ts'
import { base64urlDecode, base64urlEncode } from './base64url.ts'
import { compress, decompress } from './codec.ts'
import { decrypt, encrypt } from './crypto.ts'
import { LinkError } from './errors.ts'
import { decryptWithPassword, encryptWithPassword } from './password.ts'

/** Largest encoded payload kept in the URL; anything bigger is encrypted and stored. */
export const INLINE_LIMIT = 4096
/** Largest encrypted document accepted by storage (mirrors the database constraint). */
export const MAX_STORED_BYTES = 1048576

export type CreateLinkResult = { kind: 'ok'; url: string } | { kind: 'fallback'; url: string } | { kind: 'too-large' }

export type CreateLinkOptions = { storage: DocStorage; baseUrl: string; password?: string }

export async function createLink(text: string, opts: CreateLinkOptions): Promise<CreateLinkResult> {
  const compressed = await compress(text)
  if (opts.password) return createProtectedLink(compressed, opts.password, opts)
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

/** With a password the key is never in the link: inline as #/p/<ciphertext>, stored as #/q/<id>. */
async function createProtectedLink(compressed: Uint8Array, password: string, opts: CreateLinkOptions): Promise<CreateLinkResult> {
  const bytes = await encryptWithPassword(compressed, password)
  const payload = base64urlEncode(bytes)
  const inlineUrl = opts.baseUrl + buildHash({ kind: 'inline-protected', payload })
  if (payload.length <= INLINE_LIMIT) return { kind: 'ok', url: inlineUrl }
  if (bytes.length > MAX_STORED_BYTES) return { kind: 'too-large' }
  try {
    const id = await opts.storage.save(bytes)
    return { kind: 'ok', url: opts.baseUrl + buildHash({ kind: 'stored-protected', id }) }
  } catch (error) {
    if (error instanceof StorageUnavailableError) return { kind: 'fallback', url: inlineUrl }
    throw error
  }
}

async function load(storage: DocStorage, id: string): Promise<Uint8Array> {
  let bytes: Uint8Array | null
  try {
    bytes = await storage.load(id)
  } catch (cause) {
    if (cause instanceof StorageUnavailableError) throw new LinkError('network', { cause })
    throw cause
  }
  if (bytes === null) throw new LinkError('expired')
  return bytes
}

/** The encrypted bytes of a protected link; fetched once, then tried against passwords. */
export async function fetchProtected(
  route: Extract<Route, { kind: 'inline-protected' | 'stored-protected' }>,
  storage: DocStorage,
): Promise<Uint8Array> {
  return route.kind === 'inline-protected' ? base64urlDecode(route.payload) : load(storage, route.id)
}

/** Throws LinkError('wrong-password') for a wrong password. */
export async function openProtected(bytes: Uint8Array, password: string): Promise<string> {
  return decompress(await decryptWithPassword(bytes, password))
}

export async function openRoute(route: Extract<Route, { kind: 'inline' | 'stored' }>, storage: DocStorage): Promise<string> {
  if (route.kind === 'inline') return decompress(base64urlDecode(route.payload))
  return decompress(await decrypt(await load(storage, route.id), route.key))
}
