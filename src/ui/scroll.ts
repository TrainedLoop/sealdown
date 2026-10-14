/** Scrolls to a heading without touching location.hash, which holds the route. */
export function scrollToId(root: ParentNode, id: string): boolean {
  const target = root.querySelector(`[id="${CSS.escape(id)}"]`)
  if (!target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
