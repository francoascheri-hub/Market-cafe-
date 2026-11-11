import type { NewOrder, Order } from '../types'

export type OrderPatch = Partial<Pick<Order, 'status' | 'cubby' | 'startedAt' | 'readyAt' | 'pickedUpAt'>>

/** Where orders live. `local` = this browser only; `api` = Vercel Functions + Redis, shared across devices. */
export interface OrdersBackend {
  kind: 'local' | 'api'
  /**
   * Start syncing the live orders (not picked up, or created in the last 12 h; no seeded samples).
   * Calls onChange with that list now and on every change. Returns a stop function.
   */
  connect(onChange: (orders: Order[]) => void): () => void
  /** Every order incl. history and seeded samples (staff dashboard only; heavier than connect). */
  loadAll(): Promise<Order[]>
  /** Stores seeded demo orders as given (timestamps kept), always as picked-up samples numbered #1001+. */
  insertSamples(orders: NewOrder[]): Promise<number>
  /** Deletes every sample order (seeded + staff "Add sample order"); real orders stay. */
  clearSamples(): Promise<void>
  /** Stores a new order and returns it with its assigned order number. */
  insert(order: NewOrder): Promise<Order>
  update(id: string, patch: OrderPatch): Promise<void>
  /** Deletes every order (staff "Reset demo"). */
  clear(): Promise<void>
}
