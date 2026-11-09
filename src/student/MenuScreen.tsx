import { useState } from 'react'
import { formatPrice } from '../menu'
import type { Daypart, MenuItem, Order, Station } from '../types'
import { type Cart, STATUS_LABEL, cartLines, totalLabel } from './cart'

// Positive labels only; allergens would clutter the rows.
const SHOWN_TAGS = ['Vegan', 'Vegetarian', 'Halal']
const isPastries = (s: Station) => /pastr/i.test(s.name) // long list, collapsed by default

// "16:00" -> "4:00"
const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':')
  return `${((Number(h) + 11) % 12) + 1}:${m}`
}

interface Props {
  daypart: Daypart
  cart: Cart
  setCart: (fn: (c: Cart) => Cart) => void
  activeOrder?: Order
  onOpenOrder: (id: string) => void
  onCheckout: () => void
}

export default function MenuScreen({ daypart, cart, setCart, activeOrder, onOpenOrder, onCheckout }: Props) {
  const lines = cartLines(cart)
  const count = lines.reduce((n, l) => n + l.qty, 0)
  const change = (id: string, d: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }))

  return (
    <>
      <main className="page stack">
        {activeOrder && (
          <button className="card st-active" onClick={() => onOpenOrder(activeOrder.id)}>
            Order #{activeOrder.number} · Cubby {activeOrder.cubby} · {STATUS_LABEL[activeOrder.status]}
          </button>
        )}
        <div>
          <h2>
            {daypart.label} · {clock12(daypart.start)}–{clock12(daypart.end)}
          </h2>
          <div className="accent-bar" />
        </div>
        {daypart.stations.map((s) => (
          <StationCard key={s.name} station={s} cart={cart} change={change} />
        ))}
      </main>
      <div className="bottom-bar">
        <button className="btn" disabled={count === 0} onClick={onCheckout}>
          {count === 0 ? 'Add an item to order' : `Checkout · ${count} item${count > 1 ? 's' : ''} · ${totalLabel(lines)}`}
        </button>
      </div>
    </>
  )
}

function StationCard({ station, cart, change }: { station: Station; cart: Cart; change: (id: string, d: number) => void }) {
  const collapsible = isPastries(station)
  const [open, setOpen] = useState(!collapsible)
  return (
    <section className="card">
      <span className="label">{station.name}</span>
      {open && station.items.map((i) => <ItemRow key={i.id} item={i} qty={cart[i.id] ?? 0} change={change} />)}
      {collapsible && (
        <button className="st-toggle" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : `Show ${station.items.length}`} {station.name}
        </button>
      )}
    </section>
  )
}

function ItemRow({ item, qty, change }: { item: MenuItem; qty: number; change: (id: string, d: number) => void }) {
  const tags = item.dietary.filter((t) => SHOWN_TAGS.includes(t))
  return (
    <div className="st-row">
      <div className="st-row-main">
        <div className="st-name">{item.name}</div>
        <div>
          {formatPrice(item.price)}
          {item.priceSource === 'example' && <span className="example-price"> example price</span>}
          {tags.length > 0 && <span className="st-small"> · {tags.join(' · ')}</span>}
        </div>
      </div>
      <div className="st-qty">
        {qty > 0 ? (
          <>
            <button aria-label={`Remove one ${item.name}`} onClick={() => change(item.id, -1)}>–</button>
            <span>{qty}</span>
            <button aria-label={`Add one ${item.name}`} onClick={() => change(item.id, 1)}>+</button>
          </>
        ) : (
          <button className="st-add" aria-label={`Add ${item.name}`} onClick={() => change(item.id, 1)}>+</button>
        )}
      </div>
    </div>
  )
}
