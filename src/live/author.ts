import { decrypt, encryptWithKey } from '../share/crypto.ts'
import { readPref, writePref } from '../ui/prefs.ts'

// No accounts: the name a person types once, kept in their browser and stored encrypted with each
// version they save, so only people with the link see who edited.

const KEY = 'sealdown.author'
export function loadAuthor(): string | null {
  return readPref(KEY)
}

export function saveAuthor(name: string): void {
  writePref(KEY, name)
}

/** The names of everyone who edited between two checkpoints, encrypted like the document. */
export function encryptAuthors(names: string[], key: string): Promise<Uint8Array> {
  return encryptWithKey(new TextEncoder().encode(JSON.stringify({ names })), key)
}

/** The names on a checkpoint ([] when none or unreadable); a one-name card from before counts too. */
export async function decryptAuthors(bytes: Uint8Array, key: string): Promise<string[]> {
  if (bytes.length === 0) return []
  try {
    const card = JSON.parse(new TextDecoder().decode(await decrypt(bytes, key))) as { names?: unknown; name?: unknown }
    if (Array.isArray(card.names)) return card.names.filter((n): n is string => typeof n === 'string' && n !== '')
    return typeof card.name === 'string' && card.name !== '' ? [card.name] : []
  } catch {
    return []
  }
}

export function encryptAuthor(name: string, key: string): Promise<Uint8Array> {
  return encryptWithKey(new TextEncoder().encode(JSON.stringify({ name })), key)
}

/** The author's name, or '' when there is none or it can't be read. */
export async function decryptAuthor(bytes: Uint8Array, key: string): Promise<string> {
  if (bytes.length === 0) return ''
  try {
    const card = JSON.parse(new TextDecoder().decode(await decrypt(bytes, key))) as { name?: unknown }
    return typeof card.name === 'string' ? card.name : ''
  } catch {
    return ''
  }
}
