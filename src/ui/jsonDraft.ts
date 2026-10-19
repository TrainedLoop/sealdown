import { readPref, writePref } from './prefs.ts'

const KEY = 'sealdown.draft.json'

/** The JSON editor's draft; `{}` the first time, so the tree has something to show. */
export function loadJsonDraft(): string {
  return readPref(KEY) ?? '{}'
}

export function saveJsonDraft(text: string): void {
  writePref(KEY, text)
}
