// Shared backend: Vercel Functions (/api/orders) + Upstash Redis. Every device polls
// every ~2 s, so a phone's order shows up on the staff view and ready board almost instantly.
import type { NewOrder, Order } from '../types'
import type { OrderPatch, OrdersBackend } from './types'

const URL_ = '/api/orders'
const POLL_MS = 2000

type ListResponse = { version: number; orders?: Order[]; unchanged?: true }

export const STAFF_PIN_KEY = 'mc-staff-pin'
export const STAFF_LOCK_EVENT = 'mc-staff-lock'
const TOO_MANY = 'Too many orders right now. Wait a moment and try again.'

/** staff: send the PIN from sessionStorage, and lock the staff screens again on 401. */
async function call<T>(method: string, query = '', body?: unknown, staff = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (body) headers['content-type'] = 'application/json'
  const pin = staff ? sessionStorage.getItem(STAFF_PIN_KEY) : null
  if (pin) headers['x-staff-pin'] = pin
  const res = await fetch(URL_ + query, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (res.status === 429) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(typeof data?.error === 'string' ? data.error : TOO_MANY)
  }
  if (res.status === 401 && staff) {
    sessionStorage.removeItem(STAFF_PIN_KEY)
    window.dispatchEvent(new Event(STAFF_LOCK_EVENT))
    throw new Error('Staff PIN required')
  }
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
  let report: ((ok: boolean) => void) | undefined
  async function poll() {
    clearTimeout(timer)
    if (polling) return
    polling = true
    try {
      const r = await call<ListResponse>('GET', `?since=${version}`)
      if (!r.unchanged && r.orders) {
        version = r.version
        publish(r.orders)
      } else if (version < 0) {
        publish(orders)
      }
      report?.(true)
    } catch {
      // Keep the last list and try again. The store shows offline / service-down copy.
      report?.(false)
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
    connect(onChange, onStatus) {
      listeners.add(onChange)
      report = onStatus
      if (version >= 0) onChange(orders)
      poll()
      return () => listeners.delete(onChange)
    },
    async insert(draft: NewOrder) {
      // Staff samples keep the full draft; a student order sends only what the server accepts.
      const { id, student, lines, pickupAt, payment } = draft
      const order = draft.sample
        ? await call<Order>('POST', '', draft, true)
        : await call<Order>('POST', '', { id, student, lines, pickupAt, payment })
      publish([...orders.filter((o) => o.id !== order.id), order])
      poll()
      return order
    },
    async update(id: string, patch: OrderPatch) {
      const prev = orders
      publish(orders.map((o) => (o.id === id ? { ...o, ...patch } : o))) // optimistic
      try {
        await call<Order>('PATCH', `?id=${encodeURIComponent(id)}`, { status: patch.status, cubby: patch.cubby }, true)
      } catch (err) {
        publish(prev)
        throw err
      }
      poll()
    },
    async clear() {
      const prev = orders
      publish([])
      try {
        await call('DELETE', '', undefined, true)
      } catch (err) {
        publish(prev)
        throw err
      }
      poll()
    },
    async loadAll() {
      const r = await call<ListResponse>('GET', `?scope=all&since=${allVersion}`, undefined, true)
      if (!r.unchanged && r.orders) {
        allVersion = r.version
        all = r.orders
      }
      return all
    },
    async insertSamples(drafts: NewOrder[]) {
      return (await call<{ count: number }>('POST', '?bulk=1', { orders: drafts }, true)).count
    },
    async clearSamples() {
      await call('DELETE', '?sample=1', undefined, true)
      poll()
    },
  }
}
