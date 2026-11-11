import type { NewOrder, Order } from '../types'

export type OrderPatch = Partial<Pick<Order, 'status' | 'cubby' | 'startedAt' | 'readyAt' | 'pickedUpAt'>>

/** Where orders live. `local` = this browser only; `api` = Vercel Functions + Redis, shared across devices. */
export interface OrdersBackend {
  kind: 'local' | 'api'
  /** Start syncing. Calls onChange with the full order list now and on every change. Returns a stop function. */
  connect(onChange: (orders: Order[]) => void): () => void
  /** Stores a new order and returns it with its assigned order number. */
  insert(order: NewOrder): Promise<Order>
  update(id: string, patch: OrderPatch): Promise<void>
  /** Deletes every order (staff "Reset demo"). */
  clear(): Promise<void>
}
