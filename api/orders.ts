// Vercel Function: shared orders for every device, stored in Upstash Redis (free tier).
//
//   GET    /api/orders?since=<version>            -> live orders: { version, orders } or { version, unchanged: true }
//   GET    /api/orders?scope=all&since=<version>  -> every order incl. history + seeded samples (dashboard, staff PIN)
//   POST   /api/orders                            -> new order with the next order number + a free cubby
//   POST   /api/orders?bulk=1                     -> { orders: NewOrder[] } seeded demo orders (dashboard demo tool, staff PIN)
//   PATCH  /api/orders?id=<id>                    -> { status?, cubby? }; status changes are time-stamped here (staff PIN)
//   DELETE /api/orders                            -> reset the demo (all orders, numbering back to #201) (staff PIN)
//   DELETE /api/orders?sample=1                   -> delete every sample order, keep real ones (staff PIN)
//
// Staff calls send the x-staff-pin header. Prices, totals, status and cubby are always set here
// (see api/validate.ts), never taken from the client.
// Clients poll GET every ~2 s. `version` goes up on every write, so an unchanged poll costs one Redis read.
// The live list leaves out old picked-up orders, and seeded samples live in their own hash, so phones
// never download the dashboard's history.
import { Redis } from '@upstash/redis'
import type { Order, OrderStatus } from '../src/types.js'
import { staffPinError } from './staffPin.js'
import { rateLimitError, storageCapError } from './rateLimit.js'
import { corsBlock, corsHeaders } from './cors.js'
import { readJson, parseStudentOrder, parseStaffPatch, parseSampleBulk, MAX_JSON_BYTES, MAX_BULK_BYTES } from './validate.js'

const ORDERS = 'mc:orders' // hash: order id -> order
const SEQ = 'mc:seq' // order number counter
const VERSION = 'mc:version' // bumped on every write
const LOCK = 'mc:lock' // serialises order creation so two phones never get the same cubby
const SAMPLES = 'mc:samples' // hash: seeded demo orders (dashboard "Seed realistic demo day"), never live
const SAMPLE_SEQ = 'mc:sample-seq' // their own number counter (#1001...), so real orders keep #201...
const SAMPLES_VERSION = 'mc:samples-version' // bumped when SAMPLES changes
const FIRST_ORDER_NUMBER = 201
const FIRST_SAMPLE_NUMBER = 1001
const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000 // picked-up orders stay in the live list this long
const CUBBY_COUNT = 24
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
  pexpire?(key: string, ms: number): Promise<unknown>
}

/** Orders the live screens (student, staff, board) need: anything not picked up, plus the last 12 h. */
const isLive = (o: Order, now: number) => o.status !== 'picked-up' || now - Date.parse(o.createdAt) < LIVE_WINDOW_MS

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

/** The same response plus this request's CORS headers. */
function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Browser preflight. Never touches Redis. */
export function OPTIONS(req: Request): Response {
  return corsBlock(req) ?? new Response(null, { status: 204, headers: corsHeaders(req) })
}

export function createHandlers(getKv: () => Kv | null = redisFromEnv) {
  // CORS first (a bad origin never reaches Redis), then storage, then the route.
  const handle = (fn: (kv: Kv, req: Request) => Promise<Response>) => async (req: Request) => {
    const blocked = corsBlock(req)
    if (blocked) return blocked
    try {
      const kv = getKv()
      if (!kv) return withCors(req, json({ error: 'Storage is not configured' }, 503))
      return withCors(req, await fn(kv, req))
    } catch {
      return withCors(req, json({ error: 'Server error' }, 500))
    }
  }

  /** Staff PIN, then the staff rate limit. null = go ahead. */
  const staffGate = async (kv: Kv, req: Request) => staffPinError(req) ?? (await rateLimitError(req, kv, 'staff'))

  const allOrders = async (kv: Kv, key = ORDERS) =>
    Object.values((await kv.hgetall<Record<string, Order>>(key)) ?? {}).sort((a, b) => a.number - b.number)

  const bump = (kv: Kv) => kv.incr(VERSION)

  return {
    GET: handle(async (kv, req) => {
      const params = new URL(req.url).searchParams
      const all = params.get('scope') === 'all'
      // The live list stays public and unlimited (the ready board polls every 2 s); history is staff only.
      if (all) {
        const denied = await staffGate(kv, req)
        if (denied) return denied
      }
      let version = Number((await kv.get<number>(VERSION)) ?? 0)
      // Both counters only go up, so their sum changes whenever either list does.
      if (all) version += Number((await kv.get<number>(SAMPLES_VERSION)) ?? 0)
      const since = params.get('since')
      if (since !== null && Number(since) === version) return json({ version, unchanged: true })
      if (all) return json({ version, orders: [...(await allOrders(kv)), ...(await allOrders(kv, SAMPLES))] })
      const now = Date.now()
      return json({ version, orders: (await allOrders(kv)).filter((o) => isLive(o, now)) })
    }),

    POST: handle(async (kv, req) => {
      if (new URL(req.url).searchParams.get('bulk') === '1') {
        // Seeded demo orders: always sample + picked up (or a "ready" no-show), never on the queue or a cubby,
        // numbered #1001... from their own counter, written with one HSET into their own hash.
        const denied = await staffGate(kv, req)
        if (denied) return denied
        const body = await readJson(req, MAX_BULK_BYTES)
        if (!body.ok) return json({ error: body.error }, body.status)
        const parsed = parseSampleBulk(body.value)
        if (!parsed.ok) return json({ error: parsed.error }, 400)
        const { drafts } = parsed
        const stored = Object.keys((await kv.hgetall<Record<string, Order>>(SAMPLES)) ?? {}).length
        const full = storageCapError('sample', stored, drafts.length)
        if (full) return full
        const first = FIRST_SAMPLE_NUMBER - drafts.length + (await kv.incrby(SAMPLE_SEQ, drafts.length))
        const fields: Record<string, Order> = {}
        drafts.forEach((d, i) => {
          fields[d.id] = {
            id: d.id,
            number: first + i,
            student: d.student,
            lines: d.lines,
            total: d.total,
            pickupAt: d.pickupAt,
            payment: d.payment,
            ...(d.note ? { note: d.note } : {}),
            status: d.status, // seeded no-shows stay "ready"
            cubby: 1,
            createdAt: d.createdAt ?? new Date().toISOString(),
            startedAt: d.startedAt,
            readyAt: d.readyAt,
            pickedUpAt: d.status === 'ready' ? undefined : (d.pickedUpAt ?? d.readyAt ?? d.pickupAt),
            sample: true,
          }
        })
        await kv.hset(SAMPLES, fields)
        await kv.incr(SAMPLES_VERSION)
        return json({ count: drafts.length }, 201)
      }

      const body = await readJson(req, MAX_JSON_BYTES)
      if (!body.ok) return json({ error: body.error }, body.status)
      // Staff "Add sample order" sends sample: true and needs the PIN; anything else is a student order.
      const sample = (body.value as { sample?: unknown } | null)?.sample === true
      const denied = sample ? await staffGate(kv, req) : await rateLimitError(req, kv, 'order')
      if (denied) return denied
      const parsed = parseStudentOrder(body.value, { allowSample: sample })
      if (!parsed.ok) return json({ error: parsed.error }, 400)
      const { draft } = parsed
      // Short lock so concurrent orders get different cubbies.
      const token = crypto.randomUUID()
      for (let i = 0; i < 40 && !(await kv.set(LOCK, token, { nx: true, px: 5000 })); i++) await sleep(100)
      try {
        const existing = await allOrders(kv)
        const full = storageCapError('live', existing.length, 1)
        if (full) return full
        const used = new Set(existing.filter((o) => o.status !== 'picked-up').map((o) => o.cubby))
        let cubby = 1
        while (used.has(cubby) && cubby < CUBBY_COUNT) cubby++
        if (used.has(cubby)) cubby = 1 // shelf full: staff reassign at the counter
        const order: Order = {
          id: draft.id,
          number: FIRST_ORDER_NUMBER - 1 + (await kv.incr(SEQ)),
          student: draft.student,
          lines: draft.lines,
          total: draft.total,
          pickupAt: draft.pickupAt,
          payment: draft.payment,
          ...(draft.note ? { note: draft.note } : {}),
          status: 'received',
          cubby,
          createdAt: new Date().toISOString(),
          ...(sample ? { sample: true } : {}),
        }
        await kv.hset(ORDERS, { [order.id]: order })
        await bump(kv)
        return json(order, 201)
      } finally {
        if ((await kv.get<string>(LOCK)) === token) await kv.del(LOCK)
      }
    }),

    PATCH: handle(async (kv, req) => {
      const denied = await staffGate(kv, req)
      if (denied) return denied
      const body = await readJson(req, MAX_JSON_BYTES)
      if (!body.ok) return json({ error: body.error }, body.status)
      const parsed = parseStaffPatch(body.value)
      if (!parsed.ok) return json({ error: parsed.error }, 400)
      const id = new URL(req.url).searchParams.get('id') ?? ''
      const order = await kv.hget<Order>(ORDERS, id)
      if (!order) return json({ error: 'Order not found' }, 404)
      const { status, cubby } = parsed.patch
      const next: Order = { ...order }
      if (status !== undefined) {
        next.status = status
        const stamp = STATUS_TIMESTAMP[status]
        if (stamp) next[stamp] = new Date().toISOString()
      }
      if (cubby !== undefined) next.cubby = cubby
      await kv.hset(ORDERS, { [id]: next })
      await bump(kv)
      return json(next)
    }),

    DELETE: handle(async (kv, req) => {
      const denied = await staffGate(kv, req)
      if (denied) return denied
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
