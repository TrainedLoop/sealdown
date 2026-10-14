export type TocEntry = { id: string; text: string; level: 1 | 2 | 3 }

export function extractToc(root: ParentNode): TocEntry[] {
  return Array.from(root.querySelectorAll<HTMLHeadingElement>('h1[id], h2[id], h3[id]')).map((h) => ({
    id: h.id,
    text: h.textContent?.trim() ?? '',
    level: Number(h.tagName[1]) as TocEntry['level'],
  }))
}
