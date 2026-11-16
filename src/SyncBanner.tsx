import { useEffect, useState } from 'react'
import { useBackendKind, useOrdersLoaded, useSyncProblem } from './store'

// Wait a beat so a fast load doesn't flash "Loading orders".
function useDelayed(show: boolean, ms = 400) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setOn(true), ms)
    return () => {
      clearTimeout(t)
      setOn(false)
    }
  }, [show, ms])
  return show && on
}

/** One line for loading, offline, a down order service, or local-only mode. */
export default function SyncBanner({
  showLocal = false,
  loading = true,
  narrow = false,
}: {
  showLocal?: boolean
  loading?: boolean
  narrow?: boolean
}) {
  const loaded = useOrdersLoaded()
  const kind = useBackendKind()
  const problem = useSyncProblem()
  const waiting = useDelayed(loading && !loaded && !problem)

  if (problem === 'offline')
    return (
      <p className={`sync-note is-alert${narrow ? ' is-narrow' : ''}`} role="alert">
        You're offline. This list may be a few seconds behind, and we'll keep trying.
      </p>
    )
  if (problem === 'down')
    return (
      <p className={`sync-note is-alert${narrow ? ' is-narrow' : ''}`} role="alert">
        The order service isn't answering. We'll keep trying.
      </p>
    )
  if (waiting)
    return (
      <p className={`sync-note${narrow ? ' is-narrow' : ''}`} role="status">
        Loading orders
      </p>
    )
  if (showLocal && loaded && kind === 'local')
    return <p className={`sync-note${narrow ? ' is-narrow' : ''}`}>This browser only. Other devices won't see these orders.</p>
  return null
}
