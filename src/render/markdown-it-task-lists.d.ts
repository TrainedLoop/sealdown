declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it'
  type PluginWithOptions<T> = (md: MarkdownIt, options?: T) => void
  const taskLists: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default taskLists
}
