const MAX_FILE_BYTES = 5 * 1024 * 1024

export type FileProblem = 'not-text' | 'too-large'

/**
 * The text of a dropped or picked file, or why it can't be opened. `accepted` matches the file
 * names the page expects; files with another name must at least declare a text type.
 */
export async function readTextFile(file: File, accepted: RegExp): Promise<{ text: string } | { problem: FileProblem }> {
  if (!accepted.test(file.name) && !file.type.startsWith('text/') && file.type !== '') return { problem: 'not-text' }
  if (file.size > MAX_FILE_BYTES) return { problem: 'too-large' }
  try {
    // Strict UTF-8 plus a NUL check: an unknown extension with no type may well be binary.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    if (text.includes('\0')) return { problem: 'not-text' }
    return { text }
  } catch {
    return { problem: 'not-text' }
  }
}
