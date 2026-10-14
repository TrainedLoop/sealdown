import { extractFrontMatter, frontMatterTitle } from './frontMatter.ts'

/** Front matter `title`, else the first heading's text (outside code fences), else null. */
export function documentTitle(markdown: string): string | null {
  const yaml = extractFrontMatter(markdown)
  const fromMeta = yaml && frontMatterTitle(yaml)
  if (fromMeta) return fromMeta
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) return heading[1].replace(/[*_`~]/g, '').trim() || null
  }
  return null
}
