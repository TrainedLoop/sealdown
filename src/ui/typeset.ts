import { useEffect, useState } from 'react'
import { track } from '../analytics.ts'
import { readPref, writePref } from './prefs.ts'

export const TYPESETS = ['modern', 'editorial', 'technical'] as const
export type Typeset = (typeof TYPESETS)[number]

const KEY = 'sealdown.typeset'

/** Reading style for rendered documents (and slides), mirrored on <html data-typeset>. */
export function useTypeset(): [Typeset, (typeset: Typeset) => void] {
  const [typeset, setState] = useState<Typeset>(() => {
    const saved = readPref(KEY)
    return (TYPESETS as readonly string[]).includes(saved ?? '') ? (saved as Typeset) : 'modern'
  })
  useEffect(() => {
    document.documentElement.dataset.typeset = typeset
  }, [typeset])
  const set = (next: Typeset) => {
    if (next !== typeset) track('typeset_changed', { style: next })
    writePref(KEY, next)
    setState(next)
  }
  return [typeset, set]
}
