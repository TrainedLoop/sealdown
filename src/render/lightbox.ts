import { i18n } from '../i18n/index.ts'

/** Shows a diagram full screen. Escape or any click closes it and returns focus to `opener`. */
export function openLightbox(svg: SVGSVGElement, opener: HTMLElement): void {
  const overlay = document.createElement('div')
  overlay.className = 'lightbox'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', i18n.t('diagram.dialog'))
  overlay.tabIndex = -1
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.removeAttribute('width')
  copy.removeAttribute('height')
  copy.style.maxWidth = ''
  overlay.append(copy)

  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
    opener.focus()
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }
  overlay.addEventListener('click', close)
  document.addEventListener('keydown', onKey, true)
  document.body.append(overlay)
  overlay.focus()
}
