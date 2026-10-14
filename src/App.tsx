import { useEffect, useState } from 'react'
import { track } from './analytics.ts'
import type { Route } from './router/route.ts'
import { useHashRoute } from './router/useHashRoute.ts'
import { EditorPage } from './ui/EditorPage.tsx'
import { ErrorMessage } from './ui/ErrorMessage.tsx'
import { Header } from './ui/Header.tsx'
import { ReaderPage } from './ui/ReaderPage.tsx'
import { useTheme } from './ui/theme.ts'

function routeName(route: Route): string {
  if (route.kind === 'unknown-format' || route.kind === 'malformed') return 'error'
  return route.kind
}

export default function App() {
  const route = useHashRoute()
  const [theme, setTheme] = useTheme()
  const [openedOn] = useState(() => routeName(route))
  useEffect(() => track('app_opened', { route: openedOn }), [openedOn]) // once per visit
  return (
    <>
      <Header theme={theme} onThemeChange={setTheme} />
      <main className="page">
        {route.kind === 'editor' && <EditorPage theme={theme} />}
        {(route.kind === 'inline' || route.kind === 'stored') && <ReaderPage key={JSON.stringify(route)} route={route} theme={theme} />}
        {route.kind === 'unknown-format' && <ErrorMessage kind="unknown-format" />}
        {route.kind === 'malformed' && <ErrorMessage kind="corrupt" />}
      </main>
    </>
  )
}
