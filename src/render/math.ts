export async function renderMath(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('.math-src:not([data-rendered])')
  if (blocks.length === 0) return
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')])
  for (const block of blocks) {
    const tex = block.textContent ?? ''
    katex.render(tex, block, { displayMode: block.dataset.display === 'true', throwOnError: false })
    block.dataset.rendered = 'true'
  }
}
