import { useEffect, useSyncExternalStore } from 'react'

export type Command = { id: string; label: string; run: () => void }

// Each page (and the app shell) registers the commands that make sense while it is mounted.
const groups = new Map<string, Command[]>()
let snapshot: Command[] = []
const listeners = new Set<() => void>()

function publish() {
  snapshot = Array.from(groups.values()).flat()
  for (const listener of listeners) listener()
}

/** Registers `commands` under `group` while the caller is mounted (latest list wins). */
export function useCommands(group: string, commands: Command[]): void {
  useEffect(() => {
    groups.set(group, commands)
    publish()
  })
  useEffect(
    () => () => {
      groups.delete(group)
      publish()
    },
    [group],
  )
}

export function useAllCommands(): Command[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}
