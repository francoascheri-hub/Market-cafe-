import { formatTime } from '../menu'
import type { Order, OrderStatus } from '../types'
import { STATUS_LABEL } from './cart'

const STEPS: OrderStatus[] = ['received', 'preparing', 'ready']

export default function Confirmation({ order, onBack }: { order: Order; onBack: () => void }) {
  const current = STEPS.indexOf(order.status) // -1 when picked up

  return (
    <main className="page stack">
      <section className="card stack">
        <span className="label">Order</span>
        <div className="st-number">#{order.number}</div>
        <div>
          <div className="st-cubby">Cubby {order.cubby}</div>
          <div className="accent-bar" />
        </div>
        <div>Pickup at <strong>{formatTime(order.pickupAt)}</strong></div>
      </section>

      {order.status === 'picked-up' ? (
        <div className="card st-cubby">Picked up. Enjoy!</div>
      ) : (
        <>
          <div className="st-steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`st-step${i === current ? ' current' : i < current ? ' done' : ''}`}>
                {STATUS_LABEL[s]}
              </div>
            ))}
          </div>
          {order.status === 'ready' && <div className="st-banner">READY — grab it from cubby {order.cubby}</div>}
        </>
      )}

      <p>Walk in → grab from cubby {order.cubby} → go to class.</p>
      <button className="btn outline" onClick={onBack}>
        Back to menu
      </button>
    </main>
  )
}
