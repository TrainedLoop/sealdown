import { createContext, useContext } from 'react'

export type SlotName = 'center' | 'actions'
export type Slots = Record<SlotName, HTMLElement | null> & {
  register: (name: SlotName) => (el: HTMLElement | null) => void
}

export const SlotsContext = createContext<Slots | null>(null)

/** Ref callback the header puts on a slot's container. */
export function useSlotRef(name: SlotName) {
  return useContext(SlotsContext)?.register(name)
}
