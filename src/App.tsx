import { useHashRoute } from './router/useHashRoute.ts'
import { EditorPage } from './ui/EditorPage.tsx'
import { ErrorMessage } from './ui/ErrorMessage.tsx'
import { Header } from './ui/Header.tsx'
import { ReaderPage } from './ui/ReaderPage.tsx'
import { useTheme } from './ui/theme.ts'

export default function App() {
  const route = useHashRoute()
  const [theme, setTheme] = useTheme()
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
