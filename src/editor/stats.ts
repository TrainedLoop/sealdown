export type DocumentStats = { words: number; chars: number; lines: number; minutes: number }

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const WORDS_PER_MINUTE = 200

export function documentStats(text: string): DocumentStats {
  const words = text.match(WORD)?.length ?? 0
  return {
    words,
    chars: text.length,
    lines: text === '' ? 0 : text.split('\n').length,
    minutes: words === 0 ? 0 : Math.ceil(words / WORDS_PER_MINUTE),
  }
}
