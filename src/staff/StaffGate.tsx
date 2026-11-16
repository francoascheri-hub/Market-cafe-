// Staff PIN gate for the queue and the dashboard. The PIN lives in sessionStorage only (never in the
// bundle) and the server checks it on every staff call. With no /api (plain `npm run dev`) there is
// no shared server to protect, so the gate lets staff straight through.
import { useEffect, useState, type ReactNode } from 'react'
import { STAFF_LOCK_EVENT, STAFF_PIN_KEY } from '../backend/api'
import './staff.css'

type Check = 'open' | 'locked' | 'unavailable'

const UNAVAILABLE = 'Staff sign-in is unavailable. The shared server did not accept the PIN.'

async function check(pin: string | null): Promise<Check> {
  try {
    const res = await fetch('/api/orders?scope=all&since=-1', {
      headers: pin ? { 'x-staff-pin': pin } : undefined,
      cache: 'no-store',
    })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return 'open' // local mode
    if (res.ok) return 'open'
    return res.status === 401 ? 'locked' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export default function StaffGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | Check>('checking')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    check(sessionStorage.getItem(STAFF_PIN_KEY)).then((r) => {
      if (!live) return
      if (r === 'locked') sessionStorage.removeItem(STAFF_PIN_KEY)
      if (r === 'unavailable') setError(UNAVAILABLE)
      setState(r === 'open' ? 'open' : 'locked')
    })
    const lock = () => {
      setPin('')
      setError('')
      setState('locked')
    }
    window.addEventListener(STAFF_LOCK_EVENT, lock)
    return () => {
      live = false
      window.removeEventListener(STAFF_LOCK_EVENT, lock)
    }
  }, [])

  if (state === 'open') return <>{children}</>
  if (state === 'checking')
    return (
      <main id="main" className="page" role="status">
        Checking staff sign-in
      </main>
    )

  return (
    <>
      <header className="header">
        <h1>
          Market Café{' '}<span className="brand-sub">Staff</span>
        </h1>
      </header>
      <form
        id="main"
        className="page stack-lg staff-gate"
        onSubmit={async (e) => {
          e.preventDefault()
          const value = pin.trim()
          if (!value || busy) return
          setBusy(true)
          setError('')
          const r = await check(value)
          setBusy(false)
          if (r === 'open') {
            sessionStorage.setItem(STAFF_PIN_KEY, value)
            setState('open')
          } else {
            sessionStorage.removeItem(STAFF_PIN_KEY)
            setError(r === 'locked' ? 'That PIN doesn’t match.' : UNAVAILABLE)
          }
        }}
      >
        <div>
          <h2 className="staff-gate-title">Staff sign-in</h2>
          <div className="accent-bar" />
          <p className="staff-gate-lede">Enter the staff PIN to open the queue and the dashboard.</p>
        </div>
        <div className="stack">
          <label className="staff-gate-field">
            Staff PIN
            <input
              className="staff-gate-input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="off"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'staff-pin-error' : undefined}
            />
          </label>
          {error && (
            <p id="staff-pin-error" className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
          Continue
        </button>
      </form>
    </>
  )
}
