import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SlotsContext, type SlotName } from './headerSlotsContext.ts'

/** The header owns the slots; each page fills them with its own controls (modes, seal, …). */
export function HeaderSlotsProvider({ children }: { children: ReactNode }) {
  const [center, setCenter] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState<HTMLElement | null>(null)
  const register = (name: SlotName) => ({ center: setCenter, actions: setActions, search: setSearch })[name]
  return <SlotsContext.Provider value={{ center, actions, search, register }}>{children}</SlotsContext.Provider>
}

export function HeaderSlot({ name, children }: { name: SlotName; children: ReactNode }) {
  const target = useContext(SlotsContext)?.[name]
  return target ? createPortal(children, target) : null
}
