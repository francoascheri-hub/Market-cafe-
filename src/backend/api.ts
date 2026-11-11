// Shared backend: Vercel Functions (/api/orders) + Upstash Redis. Every device polls
// every ~2 s, so a phone's order shows up on the staff view and ready board almost instantly.
import type { NewOrder, Order } from '../types'
import type { OrderPatch, OrdersBackend } from './types'

const URL_ = '/api/orders'
const POLL_MS = 2000

type ListResponse = { version: number; orders?: Order[]; unchanged?: true }

async function call<T>(method: string, query = '', body?: unknown): Promise<T> {
  const res = await fetch(URL_ + query, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${method} ${URL_} failed: ${res.status}`)
  return (await res.json()) as T
}

/** True when /api/orders answers with JSON (i.e. running on Vercel or `vercel dev` with storage set up). */
export async function apiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(URL_, { cache: 'no-store' })
    return res.ok && (res.headers.get('content-type') ?? '').includes('application/json')
  } catch {
    return false
  }
}

export function apiBackend(): OrdersBackend {
  let orders: Order[] = []
  let version = -1
  const listeners = new Set<(orders: Order[]) => void>()
  const publish = (next: Order[]) => {
    orders = next
    listeners.forEach((l) => l(orders))
  }

  // Dashboard history (GET ?scope=all), only fetched by loadAll().
  let all: Order[] = []
  let allVersion = -1

  let timer: ReturnType<typeof setTimeout> | undefined
  let polling = false
  async function poll() {
    clearTimeout(timer)
    if (polling) return
    polling = true
    try {
      const r = await call<ListResponse>('GET', `?since=${version}`)
      if (!r.unchanged && r.orders) {
        version = r.version
        publish(r.orders)
      }
    } catch {
      // offline for a moment: keep showing the last list and try again
    } finally {
      polling = false
      if (listeners.size && document.visibilityState === 'visible') timer = setTimeout(poll, POLL_MS)
    }
  }
  // Phones pause polling in the background and refresh as soon as they're back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && listeners.size) poll()
  })

  return {
    kind: 'api',
    connect(onChange) {
      listeners.add(onChange)
      if (version >= 0) onChange(orders)
      poll()
      return () => listeners.delete(onChange)
    },
    async insert(draft: NewOrder) {
      const order = await call<Order>('POST', '', draft)
      publish([...orders.filter((o) => o.id !== order.id), order])
      poll()
      return order
    },
    async update(id: string, patch: OrderPatch) {
      publish(orders.map((o) => (o.id === id ? { ...o, ...patch } : o))) // optimistic
      await call<Order>('PATCH', `?id=${encodeURIComponent(id)}`, { status: patch.status, cubby: patch.cubby })
      poll()
    },
    async clear() {
      publish([])
      await call('DELETE')
      poll()
    },
    async loadAll() {
      const r = await call<ListResponse>('GET', `?scope=all&since=${allVersion}`)
      if (!r.unchanged && r.orders) {
        allVersion = r.version
        all = r.orders
      }
      return all
    },
    async insertSamples(drafts: NewOrder[]) {
      return (await call<{ count: number }>('POST', '?bulk=1', { orders: drafts })).count
    },
    async clearSamples() {
      await call('DELETE', '?sample=1')
      poll()
    },
  }
}
