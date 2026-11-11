// Picks where orders live:
//  - "api": Vercel Functions + Upstash Redis, shared by every device (deployed site or `vercel dev`)
//  - "local": localStorage, this browser only (plain `npm run dev`, or when /api isn't set up)
// VITE_BACKEND=local|api forces one.
import { apiAvailable, apiBackend } from './api'
import { localBackend } from './local'
import type { NewOrder } from '../types'
import type { OrderPatch, OrdersBackend } from './types'

const forced = import.meta.env.VITE_BACKEND as 'local' | 'api' | undefined
const chosen: Promise<OrdersBackend> = (forced ? Promise.resolve(forced === 'api') : apiAvailable()).then((ok) =>
  ok ? apiBackend() : localBackend(),
)

/** Resolves to the backend in use (for the "Live" / "This browser only" label). */
export const backendKind = chosen.then((b) => b.kind)

export const backend: Omit<OrdersBackend, 'kind'> = {
  connect(onChange) {
    let stop: (() => void) | undefined
    let stopped = false
    chosen.then((b) => {
      if (!stopped) stop = b.connect(onChange)
    })
    return () => {
      stopped = true
      stop?.()
    }
  },
  insert: (order: NewOrder) => chosen.then((b) => b.insert(order)),
  update: (id: string, patch: OrderPatch) => chosen.then((b) => b.update(id, patch)),
  clear: () => chosen.then((b) => b.clear()),
  loadAll: () => chosen.then((b) => b.loadAll()),
  insertSamples: (orders: NewOrder[]) => chosen.then((b) => b.insertSamples(orders)),
  clearSamples: () => chosen.then((b) => b.clearSamples()),
}
