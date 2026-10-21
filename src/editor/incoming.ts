/**
 * Text that arrived from others for a live document. `rebase` turns the text the editor holds at
 * the moment it is applied into the text to show (null: leave it, the next save merges), so
 * keystrokes typed while it was on its way are never lost.
 */
export type Incoming = { seq: number; rebase: (current: string) => string | null }
