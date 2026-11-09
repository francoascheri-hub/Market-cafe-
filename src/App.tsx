import { useEffect, useState } from 'react'
import StudentApp from './student/StudentApp'
import StaffView from './staff/StaffView'
import ReadyBoard from './board/ReadyBoard'

// Hash routes: #/ student app · #/staff staff view · #/board ready-board display
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
  if (hash.startsWith('#/staff')) return <StaffView />
  if (hash.startsWith('#/board')) return <ReadyBoard />
  return <StudentApp />
}
