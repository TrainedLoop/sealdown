import { base64urlDecode, fromBase64, toBase64 } from '../../share/base64url.ts'
import { decrypt, encryptWithKey } from '../../share/crypto.ts'

// Messages between the browsers on a live document. Every payload is encrypted with the document
// key; messages that carry content are also signed with an Ed25519 key derived from the write
// token, so readers (who hold the document key but not the token) can check them and can't forge
// them. The public key is stored with the document.

export type EnvelopeType = 'update' | 'sync1' | 'sync2' | 'presence' | 'saved'
export type Envelope = { t: EnvelopeType; s: string; d: string; m?: string }

/** Types that change what people see: only accepted with a valid signature. */
const SIGNED: ReadonlySet<EnvelopeType> = new Set(['update', 'sync2', 'presence'])
const ED25519 = { name: 'Ed25519' } as const
// PKCS#8 header of an Ed25519 private key; the 32-byte seed follows.
const PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]

/** The signing key of a document's editors: an Ed25519 key whose seed is HKDF(write token). */
export async function signingKey(token: string): Promise<{ sign: CryptoKey; publicKey: Uint8Array }> {
  const material = await crypto.subtle.importKey('raw', base64urlDecode(token) as BufferSource, 'HKDF', false, ['deriveBits'])
  const seed = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode('sealdown-live-write') },
      material,
      256,
    ),
  )
  const sign = await crypto.subtle.importKey('pkcs8', new Uint8Array([...PKCS8_PREFIX, ...seed]) as BufferSource, ED25519, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', sign)
  return { sign, publicKey: base64urlDecode(jwk.x!) }
}

export function verifyingKey(publicKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', publicKey as BufferSource, ED25519, false, ['verify'])
}

const signed = (t: string, s: string, d: string) => new TextEncoder().encode(`${t}\n${s}\n${d}`)

export async function seal(t: EnvelopeType, s: string, bytes: Uint8Array, key: string, sign?: CryptoKey): Promise<Envelope> {
  const d = toBase64(await encryptWithKey(bytes, key))
  if (!sign) return { t, s, d }
  const m = toBase64(new Uint8Array(await crypto.subtle.sign(ED25519, sign, signed(t, s, d) as BufferSource)))
  return { t, s, d, m }
}

/** The payload, or null when it can't be trusted (bad or missing signature) or decrypted. */
export async function open(env: Envelope, key: string, verify: CryptoKey | null): Promise<Uint8Array | null> {
  try {
    if (SIGNED.has(env.t)) {
      if (!verify || !env.m) return null
      const ok = await crypto.subtle.verify(ED25519, verify, fromBase64(env.m) as BufferSource, signed(env.t, env.s, env.d) as BufferSource)
      if (!ok) return null
    }
    return await decrypt(fromBase64(env.d), key)
  } catch {
    return null
  }
}
