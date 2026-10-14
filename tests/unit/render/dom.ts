import { renderMarkdown } from '../../../src/render/markdown.ts'

export function renderToDom(text: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(text)
  return root
}
