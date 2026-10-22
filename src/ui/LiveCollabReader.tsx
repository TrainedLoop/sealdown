import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { track } from '../analytics.ts'
import { useCollab } from '../live/collab/useCollab.ts'
import type { LiveReadRoute } from '../live/links.ts'
import type { Opened } from '../live/session.ts'
import { LiveBar } from './LiveBar.tsx'
import { Document } from './ReaderPage.tsx'
import type { Theme } from './theme.ts'
import { VersionsPanel } from './VersionsPanel.tsx'

/** Re-render at most this often while others type. */
const RENDER_MS = 300

/** A Markdown live document through its read link: rendered, following the editors as they type. */
export function LiveCollabReader({ route, opened, theme, notice }: { route: LiveReadRoute; opened: Opened; theme: Theme; notice?: ReactNode }) {
  const collab = useCollab(route, opened, null)
  const [text, setText] = useState(opened.doc.text)
  const [showVersions, setShowVersions] = useState(false)
  const closeVersions = useCallback(() => setShowVersions(false), [])

  useEffect(() => {
    if (!collab) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      timer ??= setTimeout(() => {
        timer = undefined
        setText(collab.text.toString())
      }, RENDER_MS)
    }
    // Catch up with what arrived before the collaboration was ready.
    update()
    collab.text.observe(update)
    return () => {
      clearTimeout(timer)
      collab.text.unobserve(update)
    }
  }, [collab])

  const banner = (
    <>
      {notice}
      <LiveBar
        version={opened.revision}
        author=""
        createdAt={opened.stateAt}
        connection={collab?.status ?? 'offline'}
        peers={collab?.peers}
        onVersions={() => {
          track('versions_viewed')
          setShowVersions(true)
        }}
      />
      {showVersions && <VersionsPanel route={route} current={text} onClose={closeVersions} />}
    </>
  )
  return <Document text={text} theme={theme} sealed banner={banner} />
}
