import { i18n } from '../i18n/index.ts'

/** A localized alert box; `retry` adds a "Try again" button. */
export function createNotice(message: string, retry?: () => void): HTMLElement {
  const box = document.createElement('div')
  box.className = 'notice'
  box.setAttribute('role', 'alert')
  const p = document.createElement('p')
  p.textContent = message
  box.append(p)
  if (retry) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = i18n.t('common.retry')
    button.addEventListener('click', retry)
    box.append(button)
  }
  return box
}

/** Marks a block whose library failed to load; the block keeps showing its raw source. */
export function showLoadFailed(block: Element, retry: () => void) {
  if (block.nextElementSibling?.classList.contains('load-failed')) return
  const notice = createNotice(i18n.t('errors.loadFailed'), retry)
  notice.classList.add('load-failed')
  block.after(notice)
}

export function clearLoadFailed(container: HTMLElement) {
  for (const el of container.querySelectorAll('.load-failed')) el.remove()
}
