// App-wide store. Orders come from a swappable backend (src/backend): the shared /api
// (Vercel Functions + Upstash Redis) when it's reachable, else localStorage (one browser only).
// The signed-in student is always per device (localStorage).
import { useSyncExternalStore } from 'react'
import { backend, backendKind as kindPromise } from './backend'
import type { OrderPatch } from './backend/types'
import type { NewOrder, Order, OrderLine, OrderStatus, PaymentMethod, Student } from './types'

const STUDENT_KEY = 'mc-student-v1'
export const CUBBY_COUNT = 24

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// --- Orders (from the backend) ---
let orders: Order[] = []
let loaded = false
backend.connect((next) => {
  orders = next
  loaded = true
  emit()
})
// Which backend is in use: 'api' (shared, live) or 'local' (this browser only); null while deciding.
let kind: 'local' | 'api' | null = null
kindPromise.then((k) => {
  kind = k
  emit()
})
export const useBackendKind = () => useSyncExternalStore(subscribe, () => kind)

export const getOrders = () => orders
export const useOrders = () => useSyncExternalStore(subscribe, getOrders)
/** False until the backend has delivered the first order list. */
export const useOrdersLoaded = () => useSyncExternalStore(subscribe, () => loaded)

// --- Signed-in student (this device only) ---
let cachedStudentRaw: string | null = null
let cachedStudent: Student | null = null
function getStudent(): Student | null {
  const raw = localStorage.getItem(STUDENT_KEY)
  if (raw !== cachedStudentRaw) {
    cachedStudentRaw = raw
    cachedStudent = raw ? (JSON.parse(raw) as Student) : null
  }
  return cachedStudent
}
window.addEventListener('storage', (e) => {
  if (e.key === STUDENT_KEY || e.key === null) emit()
})
export const useStudent = () => useSyncExternalStore(subscribe, getStudent)
export function signIn(student: Student) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student))
  emit()
}
export function signOut() {
  localStorage.removeItem(STUDENT_KEY)
  emit()
}

/** Lowest cubby not held by an order that hasn't been picked up yet. */
function freeCubby(list: Order[]): number {
  const used = new Set(list.filter((o) => o.status !== 'picked-up').map((o) => o.cubby))
  for (let c = 1; c <= CUBBY_COUNT; c++) if (!used.has(c)) return c
  return 1
}

export function placeOrder(input: {
  student: Student
  lines: OrderLine[]
  pickupAt: string
  payment: PaymentMethod
  sample?: boolean
}): Promise<Order> {
  return backend.insert({
    ...input,
    id: crypto.randomUUID(),
    total: Math.round(input.lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100,
    status: 'received',
    cubby: freeCubby(orders),
    createdAt: new Date().toISOString(),
  })
}

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, 'startedAt' | 'readyAt' | 'pickedUpAt'>> = {
  preparing: 'startedAt',
  ready: 'readyAt',
  'picked-up': 'pickedUpAt',
}

/** Change status and/or cubby. A status change also records when it happened (for metrics). */
export function updateOrder(id: string, patch: Pick<OrderPatch, 'status' | 'cubby'>): Promise<void> {
  const full: OrderPatch = { ...patch }
  const stamp = patch.status && STATUS_TIMESTAMP[patch.status]
  if (stamp) full[stamp] = new Date().toISOString()
  return backend.update(id, full)
}

export const setStatus = (id: string, status: OrderStatus) => updateOrder(id, { status })

export const resetDemo = () => backend.clear()

// --- Staff dashboard (full history; the live screens above only get recent orders) ---
export const loadAllOrders = () => backend.loadAll()
export const seedSampleOrders = (drafts: NewOrder[]) => backend.insertSamples(drafts)
export const clearSampleOrders = () => backend.clearSamples()
