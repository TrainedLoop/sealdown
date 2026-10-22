import { fromBase64, toBase64 } from '../share/base64url.ts'

/** The only code that talks to Supabase. Stores and returns opaque (already encrypted) bytes. */
export interface DocStorage {
  /** False when this build has no storage at all (no Supabase); links then carry the document. */
  configured?: boolean
  save(bytes: Uint8Array): Promise<string>
  load(id: string): Promise<Uint8Array | null>
}

/** Supabase not configured, unreachable, or answering with an error. */
export class StorageUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('storage unavailable', options)
    this.name = 'StorageUnavailableError'
  }
}

const SCHEMA = 'sealdown'

export type SupabaseConfig = { url?: string; anonKey?: string }

export const supabaseConfig: SupabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
}

/**
 * Calls one of the app's RPCs and returns the raw response, whatever its status. Throws
 * StorageUnavailableError when Supabase isn't configured or can't be reached.
 */
export async function postRpc(
  config: SupabaseConfig,
  fetchImpl: typeof fetch,
  name: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { url, anonKey } = config
  if (!url || !anonKey) throw new StorageUnavailableError()
  try {
    // Only the apikey header: publishable keys are not JWTs, so they don't go in Authorization.
    // Content-Profile selects the app's schema, which must be in the project's exposed schemas.
    return await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-profile': SCHEMA, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new StorageUnavailableError({ cause })
  }
}

export function createSupabaseStorage(
  config: SupabaseConfig,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DocStorage {
  async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await postRpc(config, fetchImpl, name, body)
    if (!response.ok) throw new StorageUnavailableError({ cause: response.status })
    return response.json()
  }

  return {
    configured: Boolean(config.url && config.anonKey),
    async save(bytes) {
      return (await rpc('create_doc', { content: toBase64(bytes) })) as string
    },
    async load(id) {
      const content = (await rpc('get_doc', { doc_id: id })) as string | null
      return content === null ? null : fromBase64(content)
    },
  }
}

export const defaultStorage: DocStorage = createSupabaseStorage(supabaseConfig)
