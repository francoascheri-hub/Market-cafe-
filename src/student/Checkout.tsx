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

const NOTE_MAX = 140

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
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const hasExample = lines.some((l) => l.priceSource === 'example')
  const total = totalLabel(lines)

  return (
    <>
      <main id="main" className="page stack-lg">
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
          {slots.length === 0 && (
            <p className="field-error" role="alert">
              No pickup times left in this service
            </p>
          )}
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

        <section className="st-note-field">
          <label className="label" htmlFor="order-note">
            Allergies or special request? <span className="label-note">Optional</span>
          </label>
          <textarea
            id="order-note"
            className="st-input st-textarea"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder="e.g. no cheese, peanut allergy"
            aria-describedby="order-note-count"
            onChange={(e) => setNote(e.target.value)}
            // Browsers don't scroll a half-visible field; centre it so the sticky pay bar never covers it.
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center' })}
          />
          <p id="order-note-count" className={`st-note-count${note.length >= NOTE_MAX ? ' is-full' : ''}`}>
            {note.length}/{NOTE_MAX}
          </p>
        </section>
      </main>
      <div className="bottom-bar">
        {error && (
          <p id="pay-error" className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn"
          disabled={lines.length === 0 || paying || !slots[slot]}
          aria-busy={paying}
          aria-describedby={error ? 'pay-error' : undefined}
          onClick={async () => {
            const when = slots[slot]
            if (!when) return
            setPaying(true)
            setError('')
            try {
              const order = await placeOrder({ student, lines, pickupAt: when.toISOString(), payment, note: note.trim() || undefined })
              onPlaced(order.id)
            } catch (err) {
              const msg = err instanceof Error ? err.message : ''
              setError(
                /^(Too many|The café)/.test(msg) ? msg : "Couldn't send your order. Check your connection and try again.",
              )
              setPaying(false)
            }
          }}
        >
          {paying ? 'Sending order…' : `Pay ${total} with USF ID`}
        </button>
      </div>
    </>
  )
}
