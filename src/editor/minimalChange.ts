/**
 * The smallest single replacement that turns `before` into `after` (common prefix and suffix
 * kept), so an editor receiving someone else's text keeps the cursor where the person is typing.
 */
export function minimalChange(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null
  let start = 0
  const shortest = Math.min(before.length, after.length)
  while (start < shortest && before[start] === after[start]) start++
  let end = 0
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) }
}
