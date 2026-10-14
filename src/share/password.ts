import { LinkError } from './errors.ts'

/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts with a key derived from the password. Returns salt || IV || ciphertext. */
export async function encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource))
  const bytes = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length)
  bytes.set(salt)
  bytes.set(iv, SALT_BYTES)
  bytes.set(ciphertext, SALT_BYTES + IV_BYTES)
  return bytes
}

/**
 * Throws LinkError('wrong-password') when decryption fails: with a password, a failed
 * authentication tag almost always means a wrong password rather than a damaged link.
 */
export async function decryptWithPassword(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (bytes.length <= SALT_BYTES + IV_BYTES) throw new LinkError('corrupt')
  const key = await deriveKey(password, bytes.subarray(0, SALT_BYTES))
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES) as BufferSource },
      key,
      bytes.subarray(SALT_BYTES + IV_BYTES) as BufferSource,
    )
    return new Uint8Array(plain)
  } catch (cause) {
    throw new LinkError('wrong-password', { cause })
  }
}
