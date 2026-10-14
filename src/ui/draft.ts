import { readPref, writePref } from './prefs.ts'

const KEY = 'rendermd.draft'

export function loadDraft(): string {
  return readPref(KEY) ?? ''
}

export function saveDraft(text: string): void {
  writePref(KEY, text)
}
