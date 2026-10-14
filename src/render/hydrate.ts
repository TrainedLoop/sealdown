import type { Theme } from '../ui/theme.ts'
import { addCopyButtons } from './copyCode.ts'
import { renderCode } from './highlight.ts'
import { renderMath } from './math.ts'
import { renderDiagrams } from './mermaid.ts'
import { clearLoadFailed, showLoadFailed } from './notice.ts'

/**
 * Renders diagrams, math and code inside already-sanitized document HTML. Each library is loaded
 * only when the document has a block that needs it. Safe to call again (theme change, retry).
 */
export async function hydrate(container: HTMLElement, theme: Theme): Promise<void> {
  clearLoadFailed(container)
  addCopyButtons(container)
  const retry = () => void hydrate(container, theme)
  const steps: [selector: string, run: () => Promise<void>][] = [
    ['figure.diagram, pre.mermaid-src', () => renderDiagrams(container, theme)],
    ['.math-src:not([data-rendered])', () => renderMath(container)],
    ['pre > code[class*="language-"]:not([data-highlighted])', () => renderCode(container)],
  ]
  await Promise.all(
    steps.map(async ([selector, run]) => {
      try {
        await run()
      } catch {
        // Only library loading can throw here; individual blocks handle their own errors.
        for (const block of container.querySelectorAll(selector)) showLoadFailed(block, retry)
      }
    }),
  )
}
