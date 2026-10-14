const en = {
  app: { name: 'rendermd', tagline: 'Paste Markdown, share a rendered link.' },
  editor: {
    code: 'Code',
    preview: 'Preview',
    placeholder: 'Paste or type Markdown here. Mermaid diagrams, math and code blocks are supported.',
    generate: 'Generate link',
    generating: 'Generating…',
    copied: 'Link copied to the clipboard.',
    copyManually: 'Copy the link below.',
    shareUrl: 'Share link',
    empty: 'Nothing to preview yet.',
  },
  reader: {
    editCopy: 'Edit a copy',
    loading: 'Loading document…',
    toc: 'Contents',
  },
  export: {
    pdf: 'Export PDF',
    md: 'Download .md',
    svg: 'SVG',
    png: 'PNG',
    diagramActions: 'Download diagram',
  },
  theme: { dark: 'Dark theme', light: 'Light theme' },
  lang: { switchTo: 'Português' },
  errors: {
    corrupt: 'This link looks incomplete. Messaging apps sometimes cut long links; ask the sender to generate it again.',
    expired: 'This document has expired. Large, rarely accessed documents are removed when space runs out.',
    network: "Couldn't load the document right now.",
    unknownFormat: 'This link was created by a newer version of rendermd. Reload the page.',
    storageUnavailable:
      "Couldn't save the document, so the link carries the whole document instead. Some apps cut long links.",
    tooLarge: 'This document is too large to share by link. Download the .md or export a PDF instead.',
    diagram: "This diagram couldn't be rendered:",
    png: "This diagram can't be exported as PNG in this browser. Download the SVG instead.",
    loadFailed: "Couldn't load what this block needs.",
  },
  common: { retry: 'Try again' },
}

export default en
