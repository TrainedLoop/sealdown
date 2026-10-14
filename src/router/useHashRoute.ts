import { useSyncExternalStore } from 'react'
import { parseRoute, type Route } from './route.ts'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash)
  return parseRoute(hash)
}
