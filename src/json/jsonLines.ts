/** Where a value starts in the text: its JSON pointer (as the tree names it) and 1-based line. */
export type JsonLine = { pointer: string; line: number }

class Stop extends Error {}

const escapeToken = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1')

/**
 * Every value of `text` in document order with the line it starts on. Invalid JSON yields the values
 * read before the error: enough to keep scroll sync close while the user is mid-edit.
 */
export function jsonLines(text: string): JsonLine[] {
  const out: JsonLine[] = []
  let i = 0
  let line = 1

  function skipSpace() {
    while (i < text.length) {
      const c = text[i]
      if (c === '\n') line++
      else if (c !== ' ' && c !== '\t' && c !== '\r') return
      i++
    }
  }

  function expect(c: string) {
    skipSpace()
    if (text[i] !== c) throw new Stop()
    i++
  }

  function string(): string {
    if (text[i] !== '"') throw new Stop()
    const start = ++i
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++
      else if (text[i] === '\n') throw new Stop()
      i++
    }
    if (i >= text.length) throw new Stop()
    const raw = text.slice(start, i++)
    try {
      return JSON.parse(`"${raw}"`) as string
    } catch {
      throw new Stop()
    }
  }

  function value(pointer: string) {
    skipSpace()
    if (i >= text.length) throw new Stop()
    out.push({ pointer, line })
    const c = text[i]
    if (c === '{') {
      i++
      skipSpace()
      if (text[i] === '}') return void i++
      for (;;) {
        skipSpace()
        const key = string()
        expect(':')
        value(`${pointer}/${escapeToken(key)}`)
        skipSpace()
        if (text[i] === ',') i++
        else return expect('}')
      }
    }
    if (c === '[') {
      i++
      skipSpace()
      if (text[i] === ']') return void i++
      for (let index = 0; ; index++) {
        value(`${pointer}/${index}`)
        skipSpace()
        if (text[i] === ',') i++
        else return expect(']')
      }
    }
    if (c === '"') return void string()
    const scalar = /^(?:-?\d[\d.eE+-]*|true|false|null)/.exec(text.slice(i, i + 400))
    if (!scalar) throw new Stop()
    i += scalar[0].length
  }

  try {
    value('')
  } catch (error) {
    // A value whose start was read but whose body broke still counts: that's what is on screen.
    if (!(error instanceof Stop)) throw error
  }
  return out
}

/** The deepest value starting at or above `line` (the last one in document order). */
export function pointerAtLine(lines: JsonLine[], line: number): string | null {
  let found: string | null = null
  for (const entry of lines) {
    if (entry.line > line) break
    found = entry.pointer
  }
  return found
}

export function lineOfPointer(lines: JsonLine[], pointer: string): number | null {
  return lines.find((entry) => entry.pointer === pointer)?.line ?? null
}
