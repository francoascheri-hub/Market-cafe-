import { useEffect, useState } from 'react'
import StudentApp from './student/StudentApp'
import StaffView from './staff/StaffView'
import ReadyBoard from './board/ReadyBoard'
import Metrics from './staff/Metrics'
import DemoPage from './demo/DemoPage'

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
  if (hash.startsWith('#/staff/metrics')) return <Metrics />
  if (hash.startsWith('#/staff')) return <StaffView />
  if (hash.startsWith('#/demo')) return <DemoPage />
  if (hash.startsWith('#/board')) return <ReadyBoard />
  return <StudentApp />
}
