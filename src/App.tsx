import { useHashRoute } from './router/useHashRoute.ts'

export default function App() {
  const route = useHashRoute()
  return <main>{route.kind}</main>
}
