export async function renderCode(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre > code[class*="language-"]:not([data-highlighted])')
  if (blocks.length === 0) return
  // The "common" build covers the usual languages and their aliases; others stay plain.
  const { default: hljs } = await import('highlight.js/lib/common')
  for (const code of blocks) {
    const lang = /language-([\w+#-]+)/.exec(code.className)?.[1]
    if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code)
    code.dataset.highlighted = 'yes'
  }
}
