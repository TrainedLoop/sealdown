import type { ReactNode } from 'react'

/** What a live document gives an editor page: its own draft and the header actions that save it. */
export type LiveEditorProps = {
  draft: { load: () => string; save: (text: string) => void }
  /** Rendered in place of Seal link; `getText` returns the freshest text on screen. */
  actions: (getText: () => string) => ReactNode
}
