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

export type LiveVersion = { version: number; content: Uint8Array; author: Uint8Array; createdAt: string }
export type VersionInfo = { version: number; author: Uint8Array; sizeBytes: number; createdAt: string }

/** Live documents in Supabase. Like DocStorage, it only ever handles encrypted bytes. */
export interface LiveStorage {
  create(content: Uint8Array, author: Uint8Array, writeHash: string): Promise<string>
  latest(id: string): Promise<LiveVersion>
  head(id: string): Promise<number>
  version(id: string, version: number): Promise<LiveVersion>
  list(id: string): Promise<VersionInfo[]>
  /** `writer` is a random id per browser; the server collapses a run of saves by the same writer. */
  save(id: string, token: string, base: number, content: Uint8Array, author: Uint8Array, writer?: string): Promise<number>
}

// SQLSTATEs raised by the live RPCs (db/migrations/20261021000000_live.sql).
const KINDS: Record<string, LiveErrorKind> = {
  '42501': 'forbidden',
  P0002: 'missing',
  '40001': 'stale',
  '53100': 'full',
  '23514': 'too-large',
}

type Row = { version?: number; content: string; author: string; created_at: string }

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

  const toVersion = (row: Row, version: number): LiveVersion => ({
    version,
    content: fromBase64(row.content),
    author: fromBase64(row.author),
    createdAt: row.created_at,
  })

  return {
    async create(content, author, writeHash) {
      return (await rpc('create_live', { content: toBase64(content), author: toBase64(author), write_hash: writeHash })) as string
    },
    async latest(id) {
      const [row] = (await rpc('get_live', { doc_id: id })) as Row[]
      if (!row) throw new LiveError('missing')
      return toVersion(row, row.version!)
    },
    async head(id) {
      const version = (await rpc('live_head', { doc_id: id })) as number | null
      if (version === null) throw new LiveError('missing')
      return version
    },
    async version(id, version) {
      const [row] = (await rpc('get_live_version', { doc_id: id, version })) as Row[]
      if (!row) throw new LiveError('missing')
      return toVersion(row, version)
    },
    async list(id) {
      const rows = (await rpc('list_versions', { doc_id: id })) as { version: number; author: string; size_bytes: number; created_at: string }[]
      return rows.map((r) => ({ version: r.version, author: fromBase64(r.author), sizeBytes: r.size_bytes, createdAt: r.created_at }))
    },
    async save(id, token, base, content, author, writer) {
      return (await rpc('save_version', {
        doc_id: id,
        // Links carry base64url; the database decodes standard base64.
        write_token: toBase64(base64urlDecode(token)),
        base_version: base,
        content: toBase64(content),
        author: toBase64(author),
        ...(writer && { writer }),
      })) as number
    },
  }
}

/** Live documents need Supabase; without it the app hides "Share to edit". */
export function liveAvailable(config: SupabaseConfig = supabaseConfig): boolean {
  return Boolean(config.url && config.anonKey)
}

export const defaultLiveStorage: LiveStorage = createLiveStorage(supabaseConfig)
