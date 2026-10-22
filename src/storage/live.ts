import { base64urlDecode, fromBase64, toBase64 } from '../share/base64url.ts'
import { postRpc, StorageUnavailableError, supabaseConfig, type SupabaseConfig } from './storage.ts'

export type LiveErrorKind = 'forbidden' | 'missing' | 'stale' | 'full' | 'network' | 'too-large'

export class LiveError extends Error {
  readonly kind: LiveErrorKind
  /** For `stale`: the latest version on the server. */
  readonly latest?: number

  constructor(kind: LiveErrorKind, options?: ErrorOptions & { latest?: number }) {
    super(`live document: ${kind}`, options)
    this.name = 'LiveError'
    this.kind = kind
    this.latest = options?.latest
  }
}

/** The current state: the text (encrypted) and, for Markdown, the encrypted Yjs state. */
export type LiveState = { revision: number; content: Uint8Array; state: Uint8Array | null; stateAt: string; signKey: Uint8Array | null }
/** A checkpoint in the history; `label` is set on named versions. */
export type LiveVersion = { version: number; content: Uint8Array; author: Uint8Array; label: Uint8Array | null; createdAt: string }
export type VersionInfo = { version: number; author: Uint8Array; label: Uint8Array | null; sizeBytes: number; createdAt: string }

/** Live documents in Supabase. Like DocStorage, it only ever handles encrypted bytes. */
export interface LiveStorage {
  /** `salt` only for a password-protected document; `state` only for Markdown (Yjs). */
  /** `signKey`: the editors' Ed25519 public key, so readers can check signed messages. */
  create(content: Uint8Array, author: Uint8Array, writeHash: string, salt?: Uint8Array, state?: Uint8Array, signKey?: Uint8Array): Promise<string>
  state(id: string): Promise<LiveState>
  /** The current revision only (the backup poll). */
  head(id: string): Promise<number>
  /** Saves the current state on top of `base`; LiveError 'stale' (with `latest`) when it moved on. */
  saveState(id: string, token: string, base: number, content: Uint8Array, state: Uint8Array | null, signKey?: Uint8Array): Promise<number>
  /** Adds a checkpoint; an automatic one (no label) right after another returns that one. */
  checkpoint(id: string, token: string, content: Uint8Array, authors: Uint8Array, label?: Uint8Array): Promise<number>
  version(id: string, version: number): Promise<LiveVersion>
  list(id: string): Promise<VersionInfo[]>
  /** The salt of a password-protected document; null without a password. */
  salt(id: string): Promise<Uint8Array | null>
}

// SQLSTATEs raised by the live RPCs (db/migrations/20261021000000_live.sql).
const KINDS: Record<string, LiveErrorKind> = {
  '42501': 'forbidden',
  P0002: 'missing',
  // PostgREST's code for an HTTP 409 (a plain 40001 would make the hosted API retry forever).
  PT409: 'stale',
  '53100': 'full',
  '23514': 'too-large',
}

const b64 = (bytes: Uint8Array | null | undefined) => (bytes ? toBase64(bytes) : null)
const bytesOf = (text: string | null) => (text === null || text === undefined ? null : fromBase64(text))
// Links carry base64url; the database decodes standard base64.
const token64 = (token: string) => toBase64(base64urlDecode(token))

export function createLiveStorage(config: SupabaseConfig, fetchImpl: typeof fetch = (...args) => fetch(...args)): LiveStorage {
  async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response
    try {
      response = await postRpc(config, fetchImpl, name, body)
    } catch (cause) {
      if (cause instanceof StorageUnavailableError) throw new LiveError('network', { cause })
      throw cause
    }
    if (response.ok) return response.json()
    const error = (await response.json().catch(() => null)) as { code?: string; details?: string | null } | null
    const kind = (error?.code && KINDS[error.code]) || 'network'
    throw new LiveError(kind, { cause: error ?? response.status, latest: kind === 'stale' ? Number(error?.details) : undefined })
  }

  return {
    async create(content, author, writeHash, salt, state, signKey) {
      return (await rpc('create_live', {
        content: toBase64(content),
        author: toBase64(author),
        write_hash: writeHash,
        ...(salt && { salt: toBase64(salt) }),
        ...(state && { state: toBase64(state) }),
        ...(signKey && { sign_key: toBase64(signKey) }),
      })) as string
    },
    async state(id) {
      const [row] = (await rpc('get_state', { doc_id: id })) as { revision: number; content: string; state: string | null; state_at: string; sign_key: string | null }[]
      if (!row) throw new LiveError('missing')
      return { revision: row.revision, content: fromBase64(row.content), state: bytesOf(row.state), stateAt: row.state_at, signKey: bytesOf(row.sign_key) }
    },
    async head(id) {
      const revision = (await rpc('live_head', { doc_id: id })) as number | null
      if (revision === null) throw new LiveError('missing')
      return revision
    },
    async saveState(id, token, base, content, state, signKey) {
      return (await rpc('save_state', {
        doc_id: id,
        write_token: token64(token),
        base_revision: base,
        content: toBase64(content),
        state: b64(state),
        ...(signKey && { sign_key: toBase64(signKey) }),
      })) as number
    },
    async checkpoint(id, token, content, authors, label) {
      return (await rpc('add_checkpoint', {
        doc_id: id,
        write_token: token64(token),
        content: toBase64(content),
        authors: toBase64(authors),
        ...(label && { label: toBase64(label) }),
      })) as number
    },
    async version(id, version) {
      const [row] = (await rpc('get_live_version', { doc_id: id, version })) as { content: string; author: string; label: string | null; created_at: string }[]
      if (!row) throw new LiveError('missing')
      return { version, content: fromBase64(row.content), author: fromBase64(row.author), label: bytesOf(row.label), createdAt: row.created_at }
    },
    async list(id) {
      const rows = (await rpc('list_versions', { doc_id: id })) as { version: number; author: string; label: string | null; size_bytes: number; created_at: string }[]
      return rows.map((r) => ({ version: r.version, author: fromBase64(r.author), label: bytesOf(r.label), sizeBytes: r.size_bytes, createdAt: r.created_at }))
    },
    async salt(id) {
      return bytesOf((await rpc('live_salt', { doc_id: id })) as string | null)
    },
  }
}

/** Live documents need Supabase; without it the app hides "Share to edit". */
export function liveAvailable(config: SupabaseConfig = supabaseConfig): boolean {
  return Boolean(config.url && config.anonKey)
}

export const defaultLiveStorage: LiveStorage = createLiveStorage(supabaseConfig)
