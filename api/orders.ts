// Vercel Function: shared orders for every device, stored in Upstash Redis (free tier).
//
//   GET    /api/orders?since=<version>            -> live orders: { version, orders } or { version, unchanged: true }
//   GET    /api/orders?scope=all&since=<version>  -> every order incl. history + seeded samples (dashboard only)
//   POST   /api/orders                            -> new order with the next order number + a free cubby
//   POST   /api/orders?bulk=1                     -> { orders: NewOrder[] } seeded demo orders (dashboard demo tool)
//   PATCH  /api/orders?id=<id>                    -> { status?, cubby? }; status changes are time-stamped here
//   DELETE /api/orders                            -> reset the demo (all orders, numbering back to #201)
//   DELETE /api/orders?sample=1                   -> delete every sample order, keep real ones
//
// Clients poll GET every ~2 s. `version` goes up on every write, so an unchanged poll costs one Redis read.
// The live list leaves out old picked-up orders, and seeded samples live in their own hash, so phones
// never download the dashboard's history.
import { Redis } from '@upstash/redis'
import type { NewOrder, Order, OrderStatus } from '../src/types.js'

const ORDERS = 'mc:orders' // hash: order id -> order
const SEQ = 'mc:seq' // order number counter
const VERSION = 'mc:version' // bumped on every write
const LOCK = 'mc:lock' // serialises order creation so two phones never get the same cubby
const SAMPLES = 'mc:samples' // hash: seeded demo orders (dashboard "Seed realistic demo day"), never live
const SAMPLE_SEQ = 'mc:sample-seq' // their own number counter (#1001...), so real orders keep #201...
const SAMPLES_VERSION = 'mc:samples-version' // bumped when SAMPLES changes
const FIRST_ORDER_NUMBER = 201
const FIRST_SAMPLE_NUMBER = 1001
const MAX_BULK = 2000
const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000 // picked-up orders stay in the live list this long
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
  incrby(key: string, by: number): Promise<number>
  set(key: string, value: string, opts: { nx: true; px: number }): Promise<unknown>
  del(...keys: string[]): Promise<number>
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>
  hget<T>(key: string, field: string): Promise<T | null>
  hset(key: string, values: Record<string, unknown>): Promise<number>
  hdel(key: string, ...fields: string[]): Promise<number>
}

/** Orders the live screens (student, staff, board) need: anything not picked up, plus the last 12 h. */
const isLive = (o: Order, now: number) => o.status !== 'picked-up' || now - Date.parse(o.createdAt) < LIVE_WINDOW_MS

const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined)
const validDraft = (d: NewOrder | undefined) => !!d?.id && Array.isArray(d.lines) && d.lines.length > 0 && !!d.student?.usfId
const linesTotal = (lines: Order['lines']) => Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100

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

  const allOrders = async (kv: Kv, key = ORDERS) =>
    Object.values((await kv.hgetall<Record<string, Order>>(key)) ?? {}).sort((a, b) => a.number - b.number)

  const bump = (kv: Kv) => kv.incr(VERSION)

  return {
    GET: withKv(async (kv, req) => {
      const params = new URL(req.url).searchParams
      const all = params.get('scope') === 'all'
      let version = Number((await kv.get<number>(VERSION)) ?? 0)
      // Both counters only go up, so their sum changes whenever either list does.
      if (all) version += Number((await kv.get<number>(SAMPLES_VERSION)) ?? 0)
      const since = params.get('since')
      if (since !== null && Number(since) === version) return json({ version, unchanged: true })
      if (all) return json({ version, orders: [...(await allOrders(kv)), ...(await allOrders(kv, SAMPLES))] })
      const now = Date.now()
      return json({ version, orders: (await allOrders(kv)).filter((o) => isLive(o, now)) })
    }),

    POST: withKv(async (kv, req) => {
      if (new URL(req.url).searchParams.get('bulk') === '1') {
        // Seeded demo orders: always sample + picked up (never on the queue, board or a cubby),
        // numbered #1001... from their own counter, written with one HSET into their own hash.
        const drafts = ((await req.json()) as { orders?: NewOrder[] })?.orders
        if (!Array.isArray(drafts) || drafts.length === 0 || drafts.length > MAX_BULK || !drafts.every(validDraft)) {
          return json({ error: 'Invalid sample orders' }, 400)
        }
        const first = FIRST_SAMPLE_NUMBER - drafts.length + (await kv.incrby(SAMPLE_SEQ, drafts.length))
        const fields: Record<string, Order> = {}
        drafts.forEach((d, i) => {
          const createdAt = iso(d.createdAt) ?? new Date().toISOString()
          const pickupAt = iso(d.pickupAt) ?? createdAt
          const readyAt = iso(d.readyAt)
          fields[d.id] = {
            id: String(d.id),
            number: first + i,
            student: { name: String(d.student.name).slice(0, 40), usfId: String(d.student.usfId).slice(0, 12) },
            lines: d.lines,
            total: linesTotal(d.lines),
            pickupAt,
            payment: d.payment === 'flexi' ? 'flexi' : 'dons-dollars',
            status: d.status === 'ready' ? 'ready' : 'picked-up', // seeded no-shows stay "ready"
            cubby: Number.isInteger(d.cubby) && d.cubby >= 1 && d.cubby <= CUBBY_COUNT ? d.cubby : 1,
            createdAt,
            startedAt: iso(d.startedAt),
            readyAt,
            pickedUpAt: d.status === 'ready' ? undefined : (iso(d.pickedUpAt) ?? readyAt ?? pickupAt),
            sample: true,
          }
        })
        await kv.hset(SAMPLES, fields)
        await kv.incr(SAMPLES_VERSION)
        return json({ count: drafts.length }, 201)
      }

      const draft = (await req.json()) as NewOrder
      if (!validDraft(draft)) return json({ error: 'Invalid order' }, 400)
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
          total: linesTotal(draft.lines),
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

    DELETE: withKv(async (kv, req) => {
      if (new URL(req.url).searchParams.get('sample') === '1') {
        // Staff "Add sample order" ones sit with the real orders; seeded ones have their own hash.
        const ids = (await allOrders(kv)).filter((o) => o.sample).map((o) => o.id)
        if (ids.length) {
          await kv.hdel(ORDERS, ...ids)
          await bump(kv)
        }
        await kv.del(SAMPLES, SAMPLE_SEQ)
        await kv.incr(SAMPLES_VERSION)
        return json({ ok: true })
      }
      await kv.del(ORDERS, SEQ, SAMPLES, SAMPLE_SEQ)
      await bump(kv)
      await kv.incr(SAMPLES_VERSION)
      return json({ ok: true })
    }),
  }
}

export const { GET, POST, PATCH, DELETE } = createHandlers()
