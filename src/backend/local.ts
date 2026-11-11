// Fallback backend: localStorage. Tabs of the same browser stay in sync through the
// `storage` event; other devices don't see these orders.
import type { NewOrder, Order } from '../types'
import type { OrderPatch, OrdersBackend } from './types'

const KEY = 'mc-orders-v1'
const SAMPLES_KEY = 'mc-samples-v1' // seeded demo orders, kept apart like the `mc:samples` Redis hash
const FIRST_ORDER_NUMBER = 201
const FIRST_SAMPLE_NUMBER = 1001
const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000

const readKey = (key: string): Order[] => JSON.parse(localStorage.getItem(key) ?? '[]') as Order[]
const read = () => readKey(KEY)
// Same rule as the API: the live list skips old picked-up orders.
const live = (orders: Order[], now = Date.now()) =>
  orders.filter((o) => o.status !== 'picked-up' || now - Date.parse(o.createdAt) < LIVE_WINDOW_MS)

export function localBackend(): OrdersBackend {
  const listeners = new Set<(orders: Order[]) => void>()
  const write = (orders: Order[]) => {
    localStorage.setItem(KEY, JSON.stringify(orders))
    listeners.forEach((l) => l(live(orders)))
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) listeners.forEach((l) => l(live(read())))
  })

  let allRaw = ''
  let all: Order[] = []

  return {
    kind: 'local',
    connect(onChange) {
      listeners.add(onChange)
      onChange(live(read()))
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
      localStorage.removeItem(SAMPLES_KEY)
      write([])
    },
    async loadAll() {
      const raw = (localStorage.getItem(KEY) ?? '') + (localStorage.getItem(SAMPLES_KEY) ?? '')
      if (raw !== allRaw) {
        allRaw = raw
        all = [...read(), ...readKey(SAMPLES_KEY)]
      }
      return all
    },
    async insertSamples(drafts: NewOrder[]) {
      const samples = readKey(SAMPLES_KEY)
      const last = samples.reduce((max, o) => Math.max(max, o.number), FIRST_SAMPLE_NUMBER - 1)
      const added = drafts.map((d, i): Order => ({ ...d, number: last + 1 + i, status: d.status === 'ready' ? 'ready' : 'picked-up', sample: true }))
      localStorage.setItem(SAMPLES_KEY, JSON.stringify([...samples, ...added]))
      return added.length
    },
    async clearSamples() {
      localStorage.removeItem(SAMPLES_KEY)
      write(read().filter((o) => !o.sample))
    },
  }
}
