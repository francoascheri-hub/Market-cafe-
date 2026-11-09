// Fallback backend: localStorage. Tabs of the same browser stay in sync through the
// `storage` event; other devices don't see these orders.
import type { NewOrder, Order } from '../types'
import type { OrderPatch, OrdersBackend } from './types'

const KEY = 'mc-orders-v1'
const FIRST_ORDER_NUMBER = 201

const read = (): Order[] => JSON.parse(localStorage.getItem(KEY) ?? '[]') as Order[]

export function localBackend(): OrdersBackend {
  const listeners = new Set<(orders: Order[]) => void>()
  const write = (orders: Order[]) => {
    localStorage.setItem(KEY, JSON.stringify(orders))
    listeners.forEach((l) => l(orders))
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) listeners.forEach((l) => l(read()))
  })

  return {
    kind: 'local',
    connect(onChange) {
      listeners.add(onChange)
      onChange(read())
      return () => listeners.delete(onChange)
    },
    async insert(draft: NewOrder) {
      const orders = read()
      const order: Order = { ...draft, number: orders.reduce((max, o) => Math.max(max, o.number), FIRST_ORDER_NUMBER - 1) + 1 }
      write([...orders, order])
      return order
    },
    async update(id: string, patch: OrderPatch) {
      write(read().map((o) => (o.id === id ? { ...o, ...patch } : o)))
    },
    async clear() {
      write([])
    },
  }
}
