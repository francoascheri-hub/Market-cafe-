import { CUBBY_COUNT, placeOrder, resetDemo, updateOrder, useBackendKind, useOrders } from '../store'
import { daypartFor, formatTime, menu, pickupSlots } from '../menu'
import type { Order, OrderLine, OrderStatus } from '../types'
import './staff.css'

const STATUS_TEXT: Record<OrderStatus, string> = {
  received: 'Received',
  preparing: 'Preparing',
  ready: 'Ready in cubby',
  'picked-up': 'Picked up',
}

// One big button per step: received → preparing → ready → picked-up
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string; className: string }>> = {
  received: { status: 'preparing', label: 'Start preparing', className: 'btn' },
  preparing: { status: 'ready', label: 'Mark ready', className: 'btn gold' },
  ready: { status: 'picked-up', label: 'Picked up', className: 'btn outline' },
}

const SAMPLE_STUDENTS = [
  { name: 'Diego', usfId: '20339876' },
  { name: 'Ana', usfId: '20412253' },
  { name: 'Sam', usfId: '20387741' },
]

const random = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

// A sample bowl made only from real builder options.
function sampleBuild(): OrderLine {
  const b = menu.burritoBuilder
  const protein = random(b.proteins)
  return {
    itemId: 'build-your-own',
    name: random(b.types),
    price: b.basePrice + protein.price,
    priceSource: protein.priceSource === 'example' ? 'example' : 'listed',
    qty: 1,
    details: [protein.name, 'Beans', 'Rice', random(b.toppings)].join(' · '),
  }
}

function addSampleOrder() {
  const items = daypartFor().stations.flatMap((s) => s.items.filter((i) => !i.builder))
  const chosen = [...new Set(Math.random() < 0.5 ? [random(items)] : [random(items), random(items)])]
  const lines: OrderLine[] = chosen.map((i) => ({ itemId: i.id, name: i.name, price: i.price, priceSource: i.priceSource, qty: 1 }))
  if (Math.random() < 0.4) lines.push(sampleBuild())
  placeOrder({
    student: random(SAMPLE_STUDENTS),
    lines,
    pickupAt: pickupSlots(1)[0].toISOString(),
    payment: 'dons-dollars',
    sample: true,
  })
}

function OrderCard({ order, usedCubbies }: { order: Order; usedCubbies: Set<number> }) {
  const next = NEXT[order.status]
  return (
    <div className="card stack">
      <div className="staff-order-top">
        <span className="staff-order-number heading">#{order.number}</span>
        <span className="staff-order-name">{order.student.name.split(' ')[0]}</span>
      </div>
      <ul className="staff-lines">
        {order.lines.map((l, i) => (
          <li key={i}>
            {l.qty}× {l.name}
            {l.details && <div className="staff-details">{l.details}</div>}
          </li>
        ))}
      </ul>
      <div className="staff-meta">
        <strong>{STATUS_TEXT[order.status]}</strong>
        <label>
          Cubby{' '}
          <select value={order.cubby} onChange={(e) => updateOrder(order.id, { cubby: Number(e.target.value) })}>
            {Array.from({ length: CUBBY_COUNT }, (_, i) => (
              <option key={i + 1} value={i + 1} disabled={usedCubbies.has(i + 1) && order.cubby !== i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      {next && (
        <button className={next.className} onClick={() => updateOrder(order.id, { status: next.status })}>
          {next.label}
        </button>
      )}
    </div>
  )
}

export default function StaffView() {
  const kind = useBackendKind()
  const orders = useOrders()
  const open = orders
    .filter((o) => o.status !== 'picked-up')
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt) || a.number - b.number)
  const groups: { slot: string; orders: Order[] }[] = []
  for (const o of open) {
    const slot = formatTime(o.pickupAt)
    const last = groups.at(-1)
    if (last?.slot === slot) last.orders.push(o)
    else groups.push({ slot, orders: [o] })
  }
  const pickedUp = orders.length - open.length
  const usedCubbies = new Set(open.map((o) => o.cubby))

  return (
    <>
      <header className="header">
        <h1>Market Café · Staff</h1>
        <nav className="staff-links">
          <a href="#/board">Ready board</a>
          <a href="#/staff/metrics">Metrics</a>
          <a href="#/">Student app</a>
        </nav>
      </header>
      <main className="staff-page">
        {groups.length === 0 && <p className="muted">No orders yet. New pre-orders appear here instantly.</p>}
        {groups.map((g) => (
          <section key={g.slot} className="staff-group">
            <span className="label">
              {g.slot} · {g.orders.length} {g.orders.length === 1 ? 'order' : 'orders'}
            </span>
            <div className="staff-grid">
              {g.orders.map((o) => (
                <OrderCard key={o.id} order={o} usedCubbies={usedCubbies} />
              ))}
            </div>
          </section>
        ))}
        <footer className="staff-footer muted">
          <span>Picked up: {pickedUp}</span>
          <span>{kind === 'api' ? '● Live: shared across devices' : kind === 'local' ? 'Local mode: this browser only' : ''}</span>
          <button className="text-btn" onClick={addSampleOrder}>
            Add sample order
          </button>
          <button className="text-btn" onClick={() => confirm('Delete all orders and reset the demo?') && resetDemo()}>
            Reset demo
          </button>
        </footer>
      </main>
    </>
  )
}
