export type FrontMatterEntry = { key: string | null; value: string | string[] }

function unquote(value: string): string {
  const v = value.trim()
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v
}

/** A deliberately small YAML subset: `key: value` and `key: [a, b]`. Other lines stay raw. */
export function parseFrontMatter(yaml: string): FrontMatterEntry[] {
  const entries: FrontMatterEntry[] = []
  for (const raw of yaml.split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(line)
    if (!match) {
      entries.push({ key: null, value: line.trim() })
      continue
    }
    const value = match[2].trim()
    const list = /^\[(.*)\]$/.exec(value)
    entries.push({
      key: match[1].trim(),
      value: list ? list[1].split(',').map(unquote).filter((item) => item !== '') : unquote(value),
    })
  }
  return entries
}

export function frontMatterTitle(yaml: string): string | null {
  const entry = parseFrontMatter(yaml).find((e) => e.key?.toLowerCase() === 'title')
  return typeof entry?.value === 'string' && entry.value !== '' ? entry.value : null
}

/** The leading `---` block of a Markdown document, if any. */
export function extractFrontMatter(markdown: string): string | null {
  return /^---[^\S\n]*\n([\s\S]*?)\n---[^\S\n]*(?:\n|$)/.exec(markdown)?.[1] ?? null
}
