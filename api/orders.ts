// Vercel Function: shared orders for every device, stored in Upstash Redis (free tier).
//
//   GET    /api/orders?since=<version>  -> { version, orders } or { version, unchanged: true }
//   POST   /api/orders                  -> new order with the next order number + a free cubby
//   PATCH  /api/orders?id=<id>          -> { status?, cubby? }; status changes are time-stamped here
//   DELETE /api/orders                  -> reset the demo (all orders, numbering back to #201)
//
// Clients poll GET every ~2 s. `version` goes up on every write, so an unchanged poll costs one Redis read.
import { Redis } from '@upstash/redis'
import type { NewOrder, Order, OrderStatus } from '../src/types.js'

const ORDERS = 'mc:orders' // hash: order id -> order
const SEQ = 'mc:seq' // order number counter
const VERSION = 'mc:version' // bumped on every write
const LOCK = 'mc:lock' // serialises order creation so two phones never get the same cubby
const FIRST_ORDER_NUMBER = 201
const CUBBY_COUNT = 24
const STATUSES: OrderStatus[] = ['received', 'preparing', 'ready', 'picked-up']
const STATUS_TIMESTAMP: Partial<Record<OrderStatus, 'startedAt' | 'readyAt' | 'pickedUpAt'>> = {
  preparing: 'startedAt',
  ready: 'readyAt',
  'picked-up': 'pickedUpAt',
}

/** The few Redis commands we use (Upstash client, or an in-memory fake in tests). */
export interface Kv {
  get<T>(key: string): Promise<T | null>
  incr(key: string): Promise<number>
  set(key: string, value: string, opts: { nx: true; px: number }): Promise<unknown>
  del(...keys: string[]): Promise<number>
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>
  hget<T>(key: string, field: string): Promise<T | null>
  hset(key: string, values: Record<string, unknown>): Promise<number>
}

// Server-side only: reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (set on the Vercel project).
// The token never reaches the browser.
function redisFromEnv(): Kv | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return Redis.fromEnv() as unknown as Kv
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createHandlers(getKv: () => Kv | null = redisFromEnv) {
  const withKv = (fn: (kv: Kv, req: Request) => Promise<Response>) => async (req: Request) => {
    const kv = getKv()
    if (!kv) return json({ error: 'Storage not configured (set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)' }, 503)
    try {
      return await fn(kv, req)
    } catch (e) {
      console.error(e)
      return json({ error: 'Server error' }, 500)
    }
  }

  const allOrders = async (kv: Kv) =>
    Object.values((await kv.hgetall<Record<string, Order>>(ORDERS)) ?? {}).sort((a, b) => a.number - b.number)

  const bump = (kv: Kv) => kv.incr(VERSION)

  return {
    GET: withKv(async (kv, req) => {
      const version = Number((await kv.get<number>(VERSION)) ?? 0)
      const since = new URL(req.url).searchParams.get('since')
      if (since !== null && Number(since) === version) return json({ version, unchanged: true })
      return json({ version, orders: await allOrders(kv) })
    }),

    POST: withKv(async (kv, req) => {
      const draft = (await req.json()) as NewOrder
      if (!draft?.id || !Array.isArray(draft.lines) || draft.lines.length === 0 || !draft.student?.usfId) {
        return json({ error: 'Invalid order' }, 400)
      }
      // Short lock so concurrent orders get different cubbies.
      const token = crypto.randomUUID()
      for (let i = 0; i < 40 && !(await kv.set(LOCK, token, { nx: true, px: 5000 })); i++) await sleep(100)
      try {
        const used = new Set((await allOrders(kv)).filter((o) => o.status !== 'picked-up').map((o) => o.cubby))
        let cubby = 1
        while (used.has(cubby) && cubby < CUBBY_COUNT) cubby++
        if (used.has(cubby)) cubby = 1 // shelf full: staff reassign at the counter
        const order: Order = {
          id: draft.id,
          number: FIRST_ORDER_NUMBER - 1 + (await kv.incr(SEQ)),
          student: { name: String(draft.student.name).slice(0, 40), usfId: String(draft.student.usfId).slice(0, 12) },
          lines: draft.lines,
          total: Math.round(draft.lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100,
          pickupAt: draft.pickupAt,
          payment: draft.payment,
          status: 'received',
          cubby,
          createdAt: new Date().toISOString(),
          ...(draft.sample ? { sample: true } : {}),
        }
        await kv.hset(ORDERS, { [order.id]: order })
        await bump(kv)
        return json(order, 201)
      } finally {
        if ((await kv.get<string>(LOCK)) === token) await kv.del(LOCK)
      }
    }),

    PATCH: withKv(async (kv, req) => {
      const id = new URL(req.url).searchParams.get('id') ?? ''
      const order = await kv.hget<Order>(ORDERS, id)
      if (!order) return json({ error: 'Order not found' }, 404)
      const { status, cubby } = (await req.json()) as { status?: OrderStatus; cubby?: number }
      const next: Order = { ...order }
      if (status !== undefined) {
        if (!STATUSES.includes(status)) return json({ error: 'Invalid status' }, 400)
        next.status = status
        const stamp = STATUS_TIMESTAMP[status]
        if (stamp) next[stamp] = new Date().toISOString()
      }
      if (cubby !== undefined) {
        if (!Number.isInteger(cubby) || cubby < 1 || cubby > CUBBY_COUNT) return json({ error: 'Invalid cubby' }, 400)
        next.cubby = cubby
      }
      await kv.hset(ORDERS, { [id]: next })
      await bump(kv)
      return json(next)
    }),

    DELETE: withKv(async (kv) => {
      await kv.del(ORDERS, SEQ)
      await bump(kv)
      return json({ ok: true })
    }),
  }
}

export const { GET, POST, PATCH, DELETE } = createHandlers()
