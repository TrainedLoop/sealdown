import DOMPurify from 'dompurify'

let configured = false

function configure() {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') ?? '')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    // Task-list checkboxes are the only inputs a document needs; anything else could imitate a login form.
    if (node.tagName === 'INPUT') {
      if (node.getAttribute('type') === 'checkbox') node.setAttribute('disabled', '')
      else node.remove()
    }
  })
  configured = true
}

/**
 * Makes rendered Markdown safe to insert. Anyone can craft a link with any content, so this is the
 * boundary that keeps a shared document from running code or restyling the page. Diagrams and math
 * are rendered after this step, by their own libraries in safe modes.
 */
export function sanitize(html: string): string {
  if (!configured) configure()
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style'],
  })
}
