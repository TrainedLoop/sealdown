export type Route =
  | { kind: 'editor' }
  | { kind: 'inline'; payload: string }
  | { kind: 'stored'; id: string; key: string }
  | { kind: 'unknown-format' }
  | { kind: 'malformed' }

export type ShareableRoute = Extract<Route, { kind: 'editor' | 'inline' | 'stored' }>

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
  return { kind: 'unknown-format' }
}

export function buildHash(route: ShareableRoute): string {
  switch (route.kind) {
    case 'editor':
      return '#/'
    case 'inline':
      return `#/v/${route.payload}`
    case 'stored':
      return `#/s/${route.id}.${route.key}`
  }
}
