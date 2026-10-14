import { track } from '../analytics.ts'
import { i18n } from '../i18n/index.ts'

const FEEDBACK_MS = 2000

/** A Copy button on every code block (not diagrams). Idempotent. */
export function addCopyButtons(container: HTMLElement): void {
  for (const pre of container.querySelectorAll<HTMLPreElement>('pre')) {
    const code = pre.querySelector(':scope > code')
    if (!code || pre.classList.contains('mermaid-src') || pre.closest('figure.diagram') || pre.querySelector('.copy-code')) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-code'
    button.setAttribute('aria-label', i18n.t('code.copy'))
    button.textContent = i18n.t('code.copyShort')
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? '')
        button.textContent = i18n.t('code.copied')
        track('code_copied')
      } catch {
        button.textContent = i18n.t('code.copyFailed')
      }
      setTimeout(() => (button.textContent = i18n.t('code.copyShort')), FEEDBACK_MS)
    })
    pre.classList.add('has-copy')
    pre.append(button)
  }
}
