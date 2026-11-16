import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import StudentApp from './student/StudentApp'

const StaffView = lazy(() => import('./staff/StaffView'))
const StaffGate = lazy(() => import('./staff/StaffGate'))
const ReadyBoard = lazy(() => import('./board/ReadyBoard'))
const DemoPage = lazy(() => import('./demo/DemoPage'))

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

function Boot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main id="main" className="page" role="status">
          {label}
        </main>
      }
    >
      {children}
    </Suspense>
  )
}

export default function App() {
  const hash = useHash()
  let screen = <StudentApp />
  if (hash.startsWith('#/staff/metrics'))
    screen = (
      <Boot label="Loading dashboard">
        <StaffGate>
          <Metrics />
        </StaffGate>
      </Boot>
    )
  else if (hash.startsWith('#/staff'))
    screen = (
      <Boot label="Loading staff view">
        <StaffGate>
          <StaffView />
        </StaffGate>
      </Boot>
    )
  else if (hash.startsWith('#/demo'))
    screen = (
      <Boot label="Loading class demo">
        <DemoPage />
      </Boot>
    )
  else if (hash.startsWith('#/board'))
    screen = (
      <Boot label="Loading ready board">
        <ReadyBoard />
      </Boot>
    )
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {screen}
    </>
  )
}
