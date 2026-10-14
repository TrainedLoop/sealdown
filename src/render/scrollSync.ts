/** The last rendered block whose source starts at or before `line` (1-based), for scroll sync. */
export function syncTarget(container: ParentNode, line: number): HTMLElement | null {
  let target: HTMLElement | null = null
  for (const el of container.querySelectorAll<HTMLElement>('[data-source-line]')) {
    const start = Number(el.dataset.sourceLine)
    if (start <= line) {
      // Prefer the outermost block for a given start (a list over its first item).
      if (!target || start > Number(target.dataset.sourceLine)) target = el
    }
  }
  return target
}
