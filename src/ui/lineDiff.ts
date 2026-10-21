import { diffComm } from 'node-diff3'

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** Line-by-line differences from `before` to `after`, for showing what a version changed. */
const lines = (text: string) => (text === '' ? [] : text.split('\n'))

export function lineDiff(before: string, after: string): DiffLine[] {
  return diffComm(lines(before), lines(after)).flatMap((part): DiffLine[] => {
    if (part.common) return part.common.map((text) => ({ kind: 'same' as const, text }))
    return [
      ...(part.buffer1 ?? []).map((text) => ({ kind: 'removed' as const, text })),
      ...(part.buffer2 ?? []).map((text) => ({ kind: 'added' as const, text })),
    ]
  })
}
