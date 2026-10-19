export type Route =
  | { kind: 'editor' }
  | { kind: 'json-editor' }
  /** Legacy: plaintext (compressed) document in the link. Opened, never generated. */
  | { kind: 'inline'; payload: string }
  /** Encrypted document in the link, with its key after the dot. */
  | { kind: 'inline-sealed'; payload: string; key: string }
  | { kind: 'stored'; id: string; key: string }
  | { kind: 'inline-protected'; payload: string }
  | { kind: 'stored-protected'; id: string }
  | { kind: 'unknown-format' }
  | { kind: 'malformed' }

export type ShareableRoute = Exclude<Route, { kind: 'unknown-format' | 'malformed' }>

const TOKEN = /^[A-Za-z0-9_-]+$/
const ID = /^[A-Za-z0-9]{10}$/
// Characters chat apps glue to the end of a link (punctuation, the > of <url>, an ellipsis,
// invisible zero-width marks). None of them occur in base64url or base62.
const TRAILING_JUNK = /[\s.,;:!?)\]}'">…\u200B-\u200D\uFEFF]+$/

export function parseRoute(hash: string): Route {
  let path: string
  try {
    path = decodeURIComponent(hash)
  } catch {
    return { kind: 'malformed' }
  }
  path = path.trim().replace(TRAILING_JUNK, '').replace(/^#/, '')
  if (path === '' || path === '/') return { kind: 'editor' }
  if (path === '/json' || path === '/json/') return { kind: 'json-editor' }

  const match = /^\/([^/]+)\/(.*)$/.exec(path)
  if (!match) return { kind: 'unknown-format' }
  const [, prefix, rest] = match

  if (prefix === 'v') {
    return TOKEN.test(rest) ? { kind: 'inline', payload: rest } : { kind: 'malformed' }
  }
  if (prefix === 's') {
    const dot = rest.indexOf('.')
    if (dot < 0) return { kind: 'malformed' }
    const id = rest.slice(0, dot)
    const key = rest.slice(dot + 1)
    return ID.test(id) && TOKEN.test(key) ? { kind: 'stored', id, key } : { kind: 'malformed' }
  }
  if (prefix === 'e') {
    const dot = rest.indexOf('.')
    if (dot < 0) return { kind: 'malformed' }
    const payload = rest.slice(0, dot)
    const key = rest.slice(dot + 1)
    return TOKEN.test(payload) && TOKEN.test(key) ? { kind: 'inline-sealed', payload, key } : { kind: 'malformed' }
  }
  if (prefix === 'p') {
    return TOKEN.test(rest) ? { kind: 'inline-protected', payload: rest } : { kind: 'malformed' }
  }
  if (prefix === 'q') {
    return ID.test(rest) ? { kind: 'stored-protected', id: rest } : { kind: 'malformed' }
  }
  return { kind: 'unknown-format' }
}

export function buildHash(route: ShareableRoute): string {
  switch (route.kind) {
    case 'editor':
      return '#/'
    case 'json-editor':
      return '#/json'
    case 'inline':
      return `#/v/${route.payload}`
    case 'stored':
      return `#/s/${route.id}.${route.key}`
    case 'inline-sealed':
      return `#/e/${route.payload}.${route.key}`
    case 'inline-protected':
      return `#/p/${route.payload}`
    case 'stored-protected':
      return `#/q/${route.id}`
  }
}
