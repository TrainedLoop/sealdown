// Plugins without bundled types (their @types packages pull in a conflicting @types/markdown-it).
type MarkdownPlugin = (md: import('markdown-it').MarkdownIt) => void
declare module 'markdown-it-footnote' {
  const footnote: MarkdownPlugin
  export default footnote
}

declare module 'markdown-it-mark' {
  const mark: MarkdownPlugin
  export default mark
}

declare module 'markdown-it-emoji' {
  export const bare: MarkdownPlugin
  export const light: MarkdownPlugin
  export const full: MarkdownPlugin
}
