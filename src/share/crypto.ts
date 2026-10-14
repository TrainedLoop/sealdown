import { base64urlDecode, base64urlEncode } from './base64url.ts'
import { LinkError } from './errors.ts'

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12
const KEY_BYTES = 32

/** Encrypts with a fresh 256-bit key. `bytes` is IV followed by ciphertext; `key` is the raw key in base64url. */
export async function encrypt(data: Uint8Array): Promise<{ bytes: Uint8Array; key: string }> {
  const cryptoKey = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_BYTES * 8 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: ALGORITHM, iv }, cryptoKey, data as BufferSource))
  const bytes = new Uint8Array(IV_BYTES + ciphertext.length)
  bytes.set(iv)
  bytes.set(ciphertext, IV_BYTES)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey))
  return { bytes, key: base64urlEncode(raw) }
}

/** Throws LinkError('corrupt') on a malformed key, wrong key or tampered bytes. */
export async function decrypt(bytes: Uint8Array, key: string): Promise<Uint8Array> {
  const raw = base64urlDecode(key)
  if (raw.length !== KEY_BYTES || bytes.length <= IV_BYTES) throw new LinkError('corrupt')
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', raw as BufferSource, ALGORITHM, false, ['decrypt'])
    const plain = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: bytes.subarray(0, IV_BYTES) as BufferSource },
      cryptoKey,
      bytes.subarray(IV_BYTES) as BufferSource,
    )
    return new Uint8Array(plain)
  } catch (cause) {
    throw new LinkError('corrupt', { cause })
  }
}
