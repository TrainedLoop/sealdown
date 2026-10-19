import { useState } from 'react'
import { readPref, writePref } from './prefs.ts'

const KEY = 'sealdown.syncScroll'

/** Split mode's scroll sync, on by default and shared by the Markdown and JSON editors. */
export function useSyncScrollPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readPref(KEY) !== 'false')
  const set = (next: boolean) => {
    writePref(KEY, String(next))
    setOn(next)
  }
  return [on, set]
}
