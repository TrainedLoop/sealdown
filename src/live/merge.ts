import { isLosslessNumber, parse, stringify } from 'lossless-json'
import { diff3Merge } from 'node-diff3'

// Three-way merges for live documents: base is the version the draft started from, mine the draft,
// theirs the latest saved version. Changes on one side apply; different changes to the same part
// on both sides become conflicts the person resolves.

export type Choice = 'mine' | 'theirs' | 'both'
/** `mine`/`theirs` are the text shown for each side (empty when that side removed it). */
export type Conflict = { id: number; label: string; mine: string; theirs: string }
export type MergeResult = { text: string } | { conflicts: Conflict[]; resolve: (choices: Record<number, Choice>) => string }

export function mergeMarkdown(base: string, mine: string, theirs: string): MergeResult {
  const regions = diff3Merge(mine.split('\n'), base.split('\n'), theirs.split('\n'), { excludeFalseConflicts: true })
  const conflicts: Conflict[] = []
  for (const region of regions) {
    if (!region.conflict) continue
    const { a, aIndex, b } = region.conflict
    const first = aIndex + 1
    const last = aIndex + Math.max(a.length, 1)
    conflicts.push({
      id: conflicts.length,
      label: first === last ? `line ${first}` : `lines ${first}–${last}`,
      mine: a.join('\n'),
      theirs: b.join('\n'),
    })
  }
  const build = (choices: Record<number, Choice>) => {
    let next = 0
    return regions
      .flatMap((region) => {
        if (region.ok) return region.ok
        const choice = choices[next++] ?? 'mine'
        const { a, b } = region.conflict!
        return choice === 'mine' ? a : choice === 'theirs' ? b : [...a, ...b]
      })
      .join('\n')
  }
  return conflicts.length === 0 ? { text: build({}) } : { conflicts, resolve: build }
}

/** Marks an unresolved conflict inside a merged JSON value until the person chooses. */
class Pending {
  readonly id: number
  readonly mine: unknown
  readonly theirs: unknown

  constructor(id: number, mine: unknown, theirs: unknown) {
    this.id = id
    this.mine = mine
    this.theirs = theirs
  }
}

const ABSENT = undefined
type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isLosslessNumber(value)
}

function equal(a: Json, b: Json): boolean {
  if (isLosslessNumber(a) || isLosslessNumber(b)) {
    return isLosslessNumber(a) && isLosslessNumber(b) && a.toString() === b.toString()
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]))
  }
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && equal(a[k], b[k]))
  }
  return a === b
}

const pointerToken = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1')
const show = (value: Json) => (value === ABSENT ? '' : (stringify(value, null, 2) ?? ''))

export function mergeJson(base: string, mine: string, theirs: string): MergeResult {
  // Only one side changed: keep its text as typed (the merge below re-prints everything).
  if (mine === base || mine === theirs) return { text: theirs }
  if (theirs === base) return { text: mine }
  let values: [Json, Json, Json]
  try {
    values = [parse(base), parse(mine), parse(theirs)]
  } catch {
    // Not all three parse: nothing to merge by path, so the whole document is the conflict.
    const conflicts = [{ id: 0, label: 'document', mine, theirs }]
    return { conflicts, resolve: (choices) => (choices[0] === 'theirs' ? theirs : mine) }
  }

  const conflicts: Conflict[] = []
  function conflict(m: Json, t: Json, pointer: string): Pending {
    const id = conflicts.length
    conflicts.push({ id, label: pointer || '/', mine: show(m), theirs: show(t) })
    return new Pending(id, m, t)
  }
  function merge(b: Json, m: Json, t: Json, pointer: string): Json {
    if (equal(m, t)) return m
    if (equal(m, b)) return t
    if (equal(t, b)) return m
    if (isObject(b) && isObject(m) && isObject(t)) {
      const out: Record<string, Json> = {}
      for (const key of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])) {
        const value = merge(b[key], m[key], t[key], `${pointer}/${pointerToken(key)}`)
        if (value !== ABSENT) out[key] = value
      }
      return out
    }
    if (Array.isArray(b) && Array.isArray(m) && Array.isArray(t)) {
      // Both sides changed the array. Merging by index is only sound when no item moved: once
      // either side inserted or removed items, indexes no longer name the same items.
      if (m.length !== b.length || t.length !== b.length) return conflict(m, t, pointer)
      const length = Math.max(b.length, m.length, t.length)
      return Array.from({ length }, (_, i) => merge(b[i], m[i], t[i], `${pointer}/${i}`)).filter((v) => v !== ABSENT)
    }
    return conflict(m, t, pointer)
  }
  const merged = merge(...values, '')

  function settle(value: Json, choices: Record<number, Choice>): Json {
    if (value instanceof Pending) return choices[value.id] === 'theirs' ? value.theirs : value.mine
    if (Array.isArray(value)) return value.map((v) => settle(v, choices)).filter((v) => v !== ABSENT)
    if (isObject(value)) {
      const out: Record<string, Json> = {}
      for (const [key, v] of Object.entries(value)) {
        const settled = settle(v, choices)
        if (settled !== ABSENT) out[key] = settled
      }
      return out
    }
    return value
  }
  const print = (choices: Record<number, Choice>) => stringify(settle(merged, choices), null, 2) ?? ''
  return conflicts.length === 0 ? { text: print({}) } : { conflicts, resolve: print }
}
