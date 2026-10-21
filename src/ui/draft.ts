import { i18n } from '../i18n/index.ts'
import welcomeEn from '../templates/welcome.en.md?raw'
import welcomePt from '../templates/welcome.pt.md?raw'
import { readPref, writePref } from './prefs.ts'

const KEY = 'sealdown.draft'

/** The saved draft; on a first visit (nothing ever saved) a short sample of what Sealdown does. */
export function loadDraft(): string {
  return readPref(KEY) ?? (i18n.language === 'pt' ? welcomePt : welcomeEn)
}

/** Nothing of the person's own: empty, or the welcome sample as it came. */
export function isUntouched(text: string): boolean {
  return text.trim() === '' || text === welcomeEn || text === welcomePt
}

export function saveDraft(text: string): void {
  writePref(KEY, text)
}
