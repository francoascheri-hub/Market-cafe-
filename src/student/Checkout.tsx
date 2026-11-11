import { useState } from 'react'
import { formatPrice, formatTime, isTomorrow, pickupSlots } from '../menu'
import { placeOrder } from '../store'
import type { OrderLine, PaymentMethod, Student } from '../types'
import { totalLabel } from './cart'
import { Icon } from './icons'

const PAYMENTS: { id: PaymentMethod; label: string; balance: string }[] = [
  { id: 'dons-dollars', label: 'Dons Dollars', balance: 'Balance $214.50 (demo)' },
  { id: 'flexi', label: 'Flexi', balance: 'Balance $86.25 (demo)' },
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
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const hasExample = lines.some((l) => l.priceSource === 'example')
  const total = totalLabel(lines)

  return (
    <>
      <main className="page stack-lg">
        <div>
          <button className="st-link" onClick={onBack}>
            <Icon name="back" />
            Back to menu
          </button>
          <h2 className="st-title">Checkout</h2>
          <div className="accent-bar" />
        </div>

        <section className="card stack">
          <h3 className="label">Your order</h3>
          {lines.map((l, i) => (
            <div key={i} className="st-line">
              <span className="st-name">
                {l.qty} × {l.name}
                {l.details && <span className="muted st-line-details">{l.details}</span>}
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
          {hasExample && <div className="example-price">* Example price, not listed on the café site</div>}
        </section>

        <section className="stack">
          <h3 className="label">Pickup time</h3>
          {slots[0] && isTomorrow(slots[0]) && <p className="muted">The café is closed now, so this is a pre-order for tomorrow</p>}
          <div className="st-grid">
            {slots.map((d, i) => (
              <button
                key={d.toISOString()}
                className={`choice${i === slot ? ' selected' : ''}`}
                aria-pressed={i === slot}
                onClick={() => setSlot(i)}
              >
                {formatTime(d)}
              </button>
            ))}
          </div>
        </section>

        <section className="stack">
          <h3 className="label">Pay with</h3>
          <div className="st-grid two">
            {PAYMENTS.map((p) => (
              <button
                key={p.id}
                className={`choice${p.id === payment ? ' selected' : ''}`}
                aria-pressed={p.id === payment}
                onClick={() => setPayment(p.id)}
              >
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
          disabled={lines.length === 0 || paying}
          onClick={async () => {
            setPaying(true)
            setError('')
            try {
              const order = await placeOrder({ student, lines, pickupAt: slots[slot].toISOString(), payment })
              onPlaced(order.id)
            } catch {
              setError('Could not send your order. Check your connection and try again.')
              setPaying(false)
            }
          }}
        >
          {paying ? 'Sending order…' : `Pay ${total} with USF ID`}
        </button>
        {error && <p className="st-error">{error}</p>}
      </div>
    </>
  )
}
