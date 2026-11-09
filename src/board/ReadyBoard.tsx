import { useOrders } from '../store'
import './board.css'

export default function ReadyBoard() {
  const orders = [...useOrders()].sort((a, b) => a.number - b.number)
  const ready = orders.filter((o) => o.status === 'ready')
  const preparing = orders.filter((o) => o.status === 'received' || o.status === 'preparing')

  return (
    <div className="board">
      <header className="header board-header">
        <h1>READY FOR PICKUP</h1>
      </header>
      <main className="board-main">
        {ready.length === 0 ? (
          <p className="board-empty">No orders ready yet.</p>
        ) : (
          <div className="board-grid">
            {ready.map((o) => (
              <div key={o.id} className="board-tile">
                <div className="board-number heading">{o.number}</div>
                <div className="board-cubby">Cubby {o.cubby}</div>
              </div>
            ))}
          </div>
        )}
        {preparing.length > 0 && (
          <p className="board-preparing">Preparing: {preparing.map((o) => o.number).join(', ')}</p>
        )}
      </main>
      <footer className="board-footer">
        <span>Walk in → grab from your cubby → go to class.</span>
        <a href="#/staff" className="board-staff-link">Staff</a>
      </footer>
    </div>
  )
}
