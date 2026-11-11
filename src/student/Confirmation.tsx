import { formatPrice, formatTime } from '../menu'
import type { Order, OrderStatus } from '../types'
import { STATUS_LABEL } from './cart'

const STEPS: OrderStatus[] = ['received', 'preparing', 'ready']

export default function Confirmation({ order, onBack }: { order: Order; onBack: () => void }) {
  const current = STEPS.indexOf(order.status) // -1 when picked up

  return (
    <main className="page stack">
      <section className="card st-ticket">
        <p className="muted">Order number</p>
        <div className="st-number">#{order.number}</div>
        <dl className="st-ticket-meta">
          <div>
            <dt>Cubby</dt>
            <dd>{order.cubby}</dd>
          </div>
          <div>
            <dt>Pickup</dt>
            <dd>{formatTime(order.pickupAt)}</dd>
          </div>
        </dl>
      </section>

      {order.status === 'picked-up' ? (
        <div className="card st-done">Picked up, enjoy your meal</div>
      ) : (
        <>
          <ol className="st-steps" aria-label="Order status">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={`st-step${i === current ? ' current' : i < current ? ' done' : ''}`}
                aria-current={i === current ? 'step' : undefined}
              >
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
          {order.status === 'ready' && <div className="st-banner">Ready — grab it from cubby {order.cubby}</div>}
        </>
      )}

      <section className="card stack">
        <h2 className="label">Your order</h2>
        {order.lines.map((l, i) => (
          <div key={i} className="st-line">
            <span className="st-name">
              {l.qty} × {l.name}
              {l.details && <span className="muted st-line-details">{l.details}</span>}
            </span>
            <span>{formatPrice(l.price * l.qty)}</span>
          </div>
        ))}
      </section>

      <p className="st-howto">Walk in, grab your order from cubby {order.cubby}, go to class</p>
      <button className="btn outline" onClick={onBack}>
        Back to menu
      </button>
    </main>
  )
}
