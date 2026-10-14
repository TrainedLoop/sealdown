/**
 * Splits sanitized document HTML into slides at top-level <hr> elements (Markdown `---`).
 * A `---` inside a code block isn't an <hr>, so it never splits. Empty slides are dropped.
 */
export function splitSlides(html: string): string[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const slides: string[] = []
  let current = document.createElement('div')
  const flush = () => {
    if (current.textContent?.trim() || current.querySelector('img, pre, table, .math-src')) slides.push(current.innerHTML)
    current = document.createElement('div')
  }
  for (const node of Array.from(body.childNodes)) {
    if (node instanceof HTMLHRElement) flush()
    else current.append(node)
  }
  flush()
  return slides
}
