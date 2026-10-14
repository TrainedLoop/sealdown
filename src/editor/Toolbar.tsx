import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { insertBlock, toggleInline, toggleLinePrefix } from './format.ts'

type Action = { id: string; label: string; icon: ReactNode; build: (state: EditorState) => TransactionSpec }

const svg = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)
const text = (label: string, style?: React.CSSProperties) => (
  <span className="toolbar-glyph" style={style} aria-hidden="true">
    {label}
  </span>
)

const ACTIONS: Action[][] = [
  [
    { id: 'h1', label: 'toolbar.h1', icon: text('H1'), build: (s) => toggleLinePrefix(s, 'h1') },
    { id: 'h2', label: 'toolbar.h2', icon: text('H2'), build: (s) => toggleLinePrefix(s, 'h2') },
    { id: 'h3', label: 'toolbar.h3', icon: text('H3'), build: (s) => toggleLinePrefix(s, 'h3') },
  ],
  [
    { id: 'bold', label: 'toolbar.bold', icon: text('B', { fontWeight: 800 }), build: (s) => toggleInline(s, '**', 'bold') },
    { id: 'italic', label: 'toolbar.italic', icon: text('I', { fontStyle: 'italic', fontFamily: 'Georgia, serif' }), build: (s) => toggleInline(s, '*', 'italic') },
    { id: 'strike', label: 'toolbar.strike', icon: text('S', { textDecoration: 'line-through' }), build: (s) => toggleInline(s, '~~', 'struck') },
    { id: 'code', label: 'toolbar.code', icon: svg(<path d="m8 8-4 4 4 4M16 8l4 4-4 4" />), build: (s) => toggleInline(s, '`', 'code') },
    { id: 'link', label: 'toolbar.link', icon: svg(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />), build: (s) => insertBlock(s, 'link') },
    { id: 'image', label: 'toolbar.image', icon: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></>), build: (s) => insertBlock(s, 'image') },
  ],
  [
    { id: 'ul', label: 'toolbar.ul', icon: svg(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />), build: (s) => toggleLinePrefix(s, 'ul') },
    { id: 'ol', label: 'toolbar.ol', icon: svg(<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 14h2l-2 3h2" />), build: (s) => toggleLinePrefix(s, 'ol') },
    { id: 'task', label: 'toolbar.task', icon: svg(<><rect x="3" y="5" width="6" height="6" rx="1" /><path d="m4.5 8 1 1 2-2M12 8h9M3 16h6M12 16h9" /></>), build: (s) => toggleLinePrefix(s, 'task') },
    { id: 'quote', label: 'toolbar.quote', icon: svg(<path d="M7 7h4v4c0 3-2 5-4 5M15 7h4v4c0 3-2 5-4 5" />), build: (s) => toggleLinePrefix(s, 'quote') },
  ],
  [
    { id: 'codeblock', label: 'toolbar.codeblock', icon: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m9 10-2 2 2 2M15 10l2 2-2 2" /></>), build: (s) => insertBlock(s, 'code') },
    { id: 'table', label: 'toolbar.table', icon: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M10 4v16" /></>), build: (s) => insertBlock(s, 'table') },
    { id: 'math', label: 'toolbar.math', icon: text('Σ'), build: (s) => insertBlock(s, 'math') },
    { id: 'divider', label: 'toolbar.divider', icon: svg(<path d="M4 12h16" />), build: (s) => insertBlock(s, 'divider') },
  ],
]

/** Formatting buttons; `children` (the diagram picker) goes at the end. */
export function Toolbar({
  onApply,
  onUsed,
  children,
}: {
  onApply: (build: (state: EditorState) => TransactionSpec) => void
  onUsed: (id: string) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="editor-format-toolbar" role="toolbar" aria-label={t('toolbar.name')}>
      {ACTIONS.map((group, i) => (
        <div className="toolbar-group" key={i}>
          {group.map((action) => (
            <button
              key={action.id}
              type="button"
              className="toolbar-button"
              aria-label={t(action.label as 'toolbar.h1')}
              title={t(action.label as 'toolbar.h1')}
              // Keep the editor's selection: don't take focus on mouse down.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onUsed(action.id)
                onApply(action.build)
              }}
            >
              {action.icon}
            </button>
          ))}
        </div>
      ))}
      {children}
    </div>
  )
}
