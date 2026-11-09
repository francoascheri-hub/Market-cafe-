// Tiny shared store in localStorage. Student, staff and ready-board tabs in the
// same browser stay in sync via the `storage` event (fires in other tabs).
import { useSyncExternalStore } from 'react'
import type { Order, OrderLine, OrderStatus, PaymentMethod, Student } from './types'

const ORDERS_KEY = 'mc-orders-v1'
const STUDENT_KEY = 'mc-student-v1'
export const CUBBY_COUNT = 24
const FIRST_ORDER_NUMBER = 201

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
window.addEventListener('storage', (e) => {
  if (e.key === ORDERS_KEY || e.key === STUDENT_KEY || e.key === null) emit()
})
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// useSyncExternalStore needs a stable snapshot, so cache by raw string.
let cachedRaw: string | null = null
let cachedOrders: Order[] = []
export function getOrders(): Order[] {
  const raw = localStorage.getItem(ORDERS_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedOrders = raw ? (JSON.parse(raw) as Order[]) : []
  }
  return cachedOrders
}
function saveOrders(orders: Order[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
  emit()
}

export const useOrders = () => useSyncExternalStore(subscribe, getOrders)

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
function freeCubby(orders: Order[]): number {
  const used = new Set(orders.filter((o) => o.status !== 'picked-up').map((o) => o.cubby))
  for (let c = 1; c <= CUBBY_COUNT; c++) if (!used.has(c)) return c
  return 1
}

export function placeOrder(input: {
  student: Student
  lines: OrderLine[]
  pickupAt: string
  payment: PaymentMethod
}): Order {
  const orders = getOrders()
  const order: Order = {
    ...input,
    id: crypto.randomUUID(),
    number: orders.reduce((max, o) => Math.max(max, o.number), FIRST_ORDER_NUMBER - 1) + 1,
    total: Math.round(input.lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100,
    status: 'received',
    cubby: freeCubby(orders),
    createdAt: new Date().toISOString(),
  }
  saveOrders([...orders, order])
  return order
}

export function updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'cubby'>>) {
  saveOrders(getOrders().map((o) => (o.id === id ? { ...o, ...patch } : o)))
}

export const setStatus = (id: string, status: OrderStatus) => updateOrder(id, { status })

export function resetDemo() {
  localStorage.removeItem(ORDERS_KEY)
  emit()
}
