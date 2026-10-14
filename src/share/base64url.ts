import { LinkError } from './errors.ts'

const CHUNK = 0x8000

/** Standard base64 (with padding), chunked so large arrays don't overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Decodes standard base64; ignores whitespace. Throws on invalid input. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function base64urlEncode(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new LinkError('corrupt')
  try {
    return fromBase64(text.replace(/-/g, '+').replace(/_/g, '/'))
  } catch (cause) {
    throw new LinkError('corrupt', { cause })
  }
}
