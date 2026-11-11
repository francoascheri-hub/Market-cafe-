import { lazy, Suspense, useEffect, useState } from 'react'
import StudentApp from './student/StudentApp'
import StaffView from './staff/StaffView'
import ReadyBoard from './board/ReadyBoard'
import DemoPage from './demo/DemoPage'

// The dashboard (with its chart library) loads only when opened, so phones get a small student app.
const Metrics = lazy(() => import('./staff/Metrics'))

// Hash routes: #/ student app · #/staff staff view · #/staff/metrics · #/board ready board · #/demo class-demo QR page
const useHash = () => {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  if (hash.startsWith('#/staff/metrics'))
    return (
      <Suspense fallback={<p className="page muted">Loading dashboard…</p>}>
        <Metrics />
      </Suspense>
    )
  if (hash.startsWith('#/staff')) return <StaffView />
  if (hash.startsWith('#/demo')) return <DemoPage />
  if (hash.startsWith('#/board')) return <ReadyBoard />
  return <StudentApp />
}
