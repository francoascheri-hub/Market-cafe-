import { useState } from 'react'
import { useOrders, useOrdersLoaded } from '../store'
import { formatTime } from '../menu'
import type { Order } from '../types'
import './staff.css'
import './metrics.css'

// Peak-hour line wait at Market Café, from the team's own observation
// (11:30–12:45 and 6:30–8:00). Each picked-up pre-order ≈ one student who skipped that line.
const LINE_MIN_MINUTES = 15
const LINE_MAX_MINUTES = 25

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

// Mean of (end − start) in ms over orders that have both timestamps
function avgDuration(orders: Order[], start: (o: Order) => string | undefined, end: (o: Order) => string | undefined) {
  const ms = orders.flatMap((o) => {
    const s = start(o)
    const e = end(o)
    return s && e ? [new Date(e).getTime() - new Date(s).getTime()] : []
  })
  return { count: ms.length, avg: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0 }
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function Metrics() {
  const allOrders = useOrders()
  const loaded = useOrdersLoaded()
  const [includeSample, setIncludeSample] = useState(true)

  const today = allOrders.filter((o) => isToday(o.createdAt))
  const sampleCount = today.filter((o) => o.sample).length
  const orders = includeSample ? today : today.filter((o) => !o.sample)

  const prep = avgDuration(orders, (o) => o.startedAt, (o) => o.readyAt)
  const toReady = avgDuration(orders, (o) => o.createdAt, (o) => o.readyAt)
  const pickedUp = orders.filter((o) => o.status === 'picked-up').length

  const slots = new Map<string, number>()
  for (const o of orders) slots.set(o.pickupAt, (slots.get(o.pickupAt) ?? 0) + 1)
  const slotRows = [...slots].sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
  const maxSlot = Math.max(1, ...slotRows.map(([, n]) => n))

  return (
    <>
      <header className="header">
        <h1>Market Café · Metrics</h1>
        <nav className="staff-links">
          <a href="#/staff">Staff view</a>
          <a href="#/board">Ready board</a>
        </nav>
      </header>
      <main className="metrics-page">
        <span className="label">Today</span>
        <div className="accent-bar" />

        <label className="metrics-toggle">
          <input type="checkbox" checked={includeSample} onChange={(e) => setIncludeSample(e.target.checked)} />
          Include sample orders
        </label>
        {includeSample && sampleCount > 0 && (
          <p className="muted metrics-note">
            {sampleCount} of these {sampleCount === 1 ? 'is a sample order' : 'are sample orders'} made with the demo button
          </p>
        )}

        {!loaded ? (
          <p className="muted">Loading orders…</p>
        ) : orders.length === 0 ? (
          <div className="card metrics-empty">No orders yet today.</div>
        ) : (
          <>
            <div className="metrics-grid">
              <div className="card">
                <div className="metrics-name">Orders today</div>
                <div className="metrics-value heading">{orders.length}</div>
              </div>
              <div className="card">
                <div className="metrics-name">Avg prep time</div>
                <div className="metrics-value heading">{prep.count ? formatDuration(prep.avg) : '—'}</div>
                {prep.count > 0 && (
                  <div className="muted">
                    ({prep.count} {prep.count === 1 ? 'order' : 'orders'}) · order to ready {formatDuration(toReady.avg)}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="metrics-name">Picked up</div>
                <div className="metrics-value heading">{pickedUp}</div>
              </div>
              <div className="card">
                <div className="metrics-name">Line time saved (estimate)</div>
                <div className="metrics-value heading">
                  {pickedUp * LINE_MIN_MINUTES}–{pickedUp * LINE_MAX_MINUTES} min
                </div>
                <div className="metrics-estimate">
                  Estimate. Assumes each pre-order skips a {LINE_MIN_MINUTES}–{LINE_MAX_MINUTES} min peak-hour line (team
                  observation at Market Café, 11:30–12:45 and 6:30–8:00).
                </div>
              </div>
            </div>

            <section className="card metrics-slots">
              <h2>Orders per pickup slot</h2>
              <ul>
                {slotRows.map(([slot, n]) => (
                  <li key={slot}>
                    <span className="metrics-slot-time">{formatTime(slot)}</span>
                    <span className="metrics-bar">
                      <span style={{ width: `${(n / maxSlot) * 100}%` }} />
                    </span>
                    <strong className="metrics-slot-count">{n}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  )
}
