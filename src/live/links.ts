import type { Route } from '../router/route.ts'
import { base64urlDecode, base64urlEncode, toBase64 } from '../share/base64url.ts'

export type LiveEditRoute = Extract<Route, { kind: 'live-edit' }>
export type LiveReadRoute = Extract<Route, { kind: 'live-read' }>

/** The secret that lets an edit link save: 32 random bytes, base64url. */
export function newWriteToken(): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
}

/** What the server stores and checks: SHA-256 of the raw token, standard base64. */
export async function writeHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', base64urlDecode(token) as BufferSource)
  return toBase64(new Uint8Array(digest))
}

export function readLinkOf(route: LiveEditRoute): LiveReadRoute {
  return { kind: 'live-read', id: route.id, key: route.key }
}
