/**
 * Scrolls to a heading without touching location.hash, which holds the route. Document ids carry
 * the sanitizer's "user-content-" prefix; links written as #heading are matched against both.
 */
export function scrollToId(root: ParentNode, id: string): boolean {
  const target =
    root.querySelector(`[id="${CSS.escape(id)}"]`) ?? root.querySelector(`[id="${CSS.escape(`user-content-${id}`)}"]`)
  if (!target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
