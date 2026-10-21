import { useEffect, useState } from 'react'
import { setAnalyticsContext, track, trackPageview } from './analytics.ts'
import type { Route } from './router/route.ts'
import { useHashRoute } from './router/useHashRoute.ts'
import { EditorPage } from './ui/EditorPage.tsx'
import { JsonEditorPage } from './ui/JsonEditorPage.tsx'
import { LiveEditPage } from './ui/LiveEditPage.tsx'
import { LiveReadPage } from './ui/LiveReadPage.tsx'
import { LiveGate } from './ui/LiveGate.tsx'
import { ErrorMessage } from './ui/ErrorMessage.tsx'
import { Header } from './ui/Header.tsx'
import { HeaderSlotsProvider } from './ui/headerSlots.tsx'
import { CommandPalette } from './ui/CommandPalette.tsx'
import { ReaderPage } from './ui/ReaderPage.tsx'
import { useTheme } from './ui/theme.ts'

function routeName(route: Route): string {
  if (route.kind === 'unknown-format' || route.kind === 'malformed') return 'error'
  if (route.kind === 'inline-protected' || route.kind === 'stored-protected') return 'protected'
  return route.kind
}

export default function App() {
  const route = useHashRoute()
  const [theme, setTheme] = useTheme()
  const [openedOn] = useState(() => routeName(route))
  useEffect(() => track('app_opened', { route: openedOn }), [openedOn]) // once per visit
  const current = routeName(route)
  useEffect(() => {
    setAnalyticsContext({ route: current })
    trackPageview(current) // per kind of page, not per URL
  }, [current])
  return (
    <HeaderSlotsProvider>
      <Header route={route} theme={theme} onThemeChange={setTheme} />
      <CommandPalette />
      <main className={route.kind === 'editor' || route.kind === 'json-editor' || route.kind === 'live-edit' || route.kind === 'live-edit-protected'
            ? 'page page-app'
            : 'page page-reader'}>
        {route.kind === 'editor' && <EditorPage theme={theme} />}
        {route.kind === 'json-editor' && <JsonEditorPage />}
        {route.kind === 'live-edit' && <LiveEditPage key={route.id} route={route} theme={theme} />}
        {route.kind === 'live-read' && <LiveReadPage key={route.id} route={route} theme={theme} />}
        {(route.kind === 'live-edit-protected' || route.kind === 'live-read-protected') && (
          <LiveGate key={route.id} route={route} theme={theme} />
        )}
        {(route.kind === 'inline' ||
          route.kind === 'inline-sealed' ||
          route.kind === 'stored' ||
          route.kind === 'inline-protected' ||
          route.kind === 'stored-protected') && <ReaderPage key={JSON.stringify(route)} route={route} theme={theme} />}
        {route.kind === 'unknown-format' && <ErrorMessage kind="unknown-format" />}
        {route.kind === 'malformed' && <ErrorMessage kind="corrupt" />}
      </main>
    </HeaderSlotsProvider>
  )
}
