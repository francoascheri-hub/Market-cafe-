import { useState } from 'react'
import { formatPrice } from '../menu'
import type { Daypart, MenuItem, Order, OrderLine, Station } from '../types'
import { type Cart, STATUS_LABEL, cartLines, totalLabel } from './cart'
import { Icon } from './icons'
import { MenuStrip, PhotoCredit } from './photos'

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
  onBuild: () => void
}

interface RowActions {
  change: (id: string, d: number) => void
  onBuild: () => void
  removeBuild: (b: OrderLine) => void
}

export default function MenuScreen({ daypart, cart, setCart, activeOrder, onOpenOrder, onCheckout, onBuild }: Props) {
  const lines = cartLines(cart)
  const count = lines.reduce((n, l) => n + l.qty, 0)
  const change = (id: string, d: number) =>
    setCart((c) => ({ ...c, items: { ...c.items, [id]: Math.max(0, (c.items[id] ?? 0) + d) } }))
  const actions: RowActions = {
    change,
    onBuild,
    removeBuild: (b) => setCart((c) => ({ ...c, builds: c.builds.filter((x) => x !== b) })),
  }

  return (
    <>
      <main className="page stack">
        {activeOrder && (
          <button className="card st-active" onClick={() => onOpenOrder(activeOrder.id)}>
            <span className="st-row-main">
              <span className="st-active-title heading">Order #{activeOrder.number}</span>
              <span className="st-active-meta">
                Cubby {activeOrder.cubby} · {STATUS_LABEL[activeOrder.status]}
              </span>
            </span>
            <Icon name="next" />
          </button>
        )}
        <div className="st-intro">
          <h2 className="st-title">{daypart.label}</h2>
          <p className="muted">
            Served {clock12(daypart.start)}–{clock12(daypart.end)}
          </p>
          <div className="accent-bar" />
        </div>
        <MenuStrip />
        {daypart.stations.map((s) => (
          <StationCard key={s.name} station={s} cart={cart} actions={actions} />
        ))}
        <PhotoCredit />
      </main>
      <div className="bottom-bar">
        <button className="btn" disabled={count === 0} onClick={onCheckout}>
          {count === 0 ? 'Add an item to order' : `Checkout · ${count} item${count > 1 ? 's' : ''} · ${totalLabel(lines)}`}
        </button>
      </div>
    </>
  )
}

function StationCard({ station, cart, actions }: { station: Station; cart: Cart; actions: RowActions }) {
  const collapsible = isPastries(station)
  const [open, setOpen] = useState(!collapsible)
  return (
    <section className="card st-station">
      <h3 className="label">{station.name}</h3>
      {open &&
        station.items.map((i) =>
          i.builder ? (
            <BuilderRow key={i.id} item={i} builds={cart.builds.filter((b) => b.itemId === i.id)} actions={actions} />
          ) : (
            <ItemRow key={i.id} item={i} qty={cart.items[i.id] ?? 0} change={actions.change} />
          ),
        )}
      {collapsible && (
        <button className="st-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide items' : `Show all ${station.items.length} items`}
          <Icon name={open ? 'up' : 'down'} />
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
        {(item.priceSource === 'example' || tags.length > 0) && (
          <span className="st-meta">
            {item.priceSource === 'example' && 'Example price'}
            {item.priceSource === 'example' && tags.length > 0 && ' · '}
            {tags.join(' · ')}
          </span>
        )}
      </div>
      <div className="st-price">{formatPrice(item.price)}</div>
      <div className="st-qty">
        {qty > 0 ? (
          <>
            <button aria-label={`Remove one ${item.name}`} onClick={() => change(item.id, -1)}>
              <Icon name="minus" />
            </button>
            <span>{qty}</span>
            <button aria-label={`Add one ${item.name}`} onClick={() => change(item.id, 1)}>
              <Icon name="plus" />
            </button>
          </>
        ) : (
          <button className="st-add" aria-label={`Add ${item.name}`} onClick={() => change(item.id, 1)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
    </div>
  )
}

// Opens the builder; builds already in the cart are listed below with a remove button.
function BuilderRow({ item, builds, actions }: { item: MenuItem; builds: OrderLine[]; actions: RowActions }) {
  return (
    <>
      <div className="st-row">
        <div className="st-row-main">
          <div className="st-name">{item.name}</div>
        </div>
        <div className="st-price">from {formatPrice(item.price)}</div>
        <button className="st-build-btn" aria-label={item.name} onClick={actions.onBuild}>
          Build
          <Icon name="next" />
        </button>
      </div>
      {builds.map((b, i) => (
        <div key={i} className="st-build">
          <div className="st-row-main">
            <div className="st-name">
              {b.name} · {formatPrice(b.price)}
            </div>
            <div className="st-small">{b.details}</div>
          </div>
          <div className="st-qty">
            <button aria-label={`Remove ${b.name}: ${b.details}`} onClick={() => actions.removeBuild(b)}>
              <Icon name="minus" />
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
