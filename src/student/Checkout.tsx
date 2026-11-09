import { useState } from 'react'
import { formatPrice, formatTime, isTomorrow, pickupSlots } from '../menu'
import { placeOrder } from '../store'
import type { OrderLine, PaymentMethod, Student } from '../types'
import { totalLabel } from './cart'

const PAYMENTS: { id: PaymentMethod; label: string; balance: string }[] = [
  { id: 'dons-dollars', label: 'Dons Dollars', balance: 'Balance $214.50 (demo)' },
  { id: 'flexi', label: 'Flexi', balance: 'Balance $86.25 (demo)' },
  { id: 'meal-swipe', label: 'Meal swipe', balance: '7 swipes left this week (demo)' },
]

interface Props {
  student: Student
  lines: OrderLine[]
  onBack: () => void
  onPlaced: (orderId: string) => void
}

export default function Checkout({ student, lines, onBack, onPlaced }: Props) {
  const [slots] = useState(() => pickupSlots(6))
  const [slot, setSlot] = useState(0)
  const [payment, setPayment] = useState<PaymentMethod>('dons-dollars')
  const hasExample = lines.some((l) => l.priceSource === 'example')
  const total = totalLabel(lines)

  return (
    <>
      <main className="page stack">
        <button className="st-link" onClick={onBack}>
          ← Back to menu
        </button>

        <section className="card stack">
          <span className="label">Your order</span>
          {lines.map((l) => (
            <div key={l.itemId} className="st-line">
              <span className="st-name">
                {l.qty} × {l.name}
              </span>
              <span>
                {formatPrice(l.price * l.qty)}
                {l.priceSource === 'example' && <span className="example-price">*</span>}
              </span>
            </div>
          ))}
          <div className="st-line st-total">
            <span>Total</span>
            <span>{total}</span>
          </div>
          {hasExample && <div className="example-price">* example price — not listed on the café site</div>}
        </section>

        <section className="stack">
          <span className="label">Pickup time</span>
          {slots[0] && isTomorrow(slots[0]) && <p className="muted">Café is closed now: this is a pre-order for tomorrow.</p>}
          <div className="st-grid">
            {slots.map((d, i) => (
              <button key={d.toISOString()} className={`choice${i === slot ? ' selected' : ''}`} onClick={() => setSlot(i)}>
                {formatTime(d)}
              </button>
            ))}
          </div>
        </section>

        <section className="stack">
          <span className="label">Pay with</span>
          <div className="st-grid">
            {PAYMENTS.map((p) => (
              <button key={p.id} className={`choice${p.id === payment ? ' selected' : ''}`} onClick={() => setPayment(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="muted">{PAYMENTS.find((p) => p.id === payment)?.balance}</div>
        </section>
      </main>
      <div className="bottom-bar">
        <button
          className="btn"
          disabled={lines.length === 0}
          onClick={() => {
            const order = placeOrder({ student, lines, pickupAt: slots[slot].toISOString(), payment })
            onPlaced(order.id)
          }}
        >
          Pay {total} with USF ID
        </button>
      </div>
    </>
  )
}
