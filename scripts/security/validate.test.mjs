// Loads api/orders.ts through Vite with an in-memory Redis and checks that forged orders are refused.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

process.env.STAFF_PIN = '246810'

const root = fileURLToPath(new URL('../..', import.meta.url))
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { createHandlers } = await vite.ssrLoadModule('/api/orders.ts')

after(async () => {
  await vite.close()
})

/** Just enough Redis for orders.ts and rateLimit.ts. */
function memoryKv() {
  const values = new Map()
  const hashes = new Map()
  const hash = (key) => {
    if (!hashes.has(key)) hashes.set(key, new Map())
    return hashes.get(key)
  }
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)))
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null
    },
    async incr(key) {
      return this.incrby(key, 1)
    },
    async incrby(key, by) {
      const next = Number(values.get(key) ?? 0) + by
      values.set(key, next)
      return next
    },
    async set(key, value, opts) {
      if (opts?.nx && values.has(key)) return null
      values.set(key, value)
      return 'OK'
    },
    async del(...keys) {
      let n = 0
      for (const k of keys) if (values.delete(k) | hashes.delete(k)) n++
      return n
    },
    async hgetall(key) {
      const h = hashes.get(key)
      return h && h.size ? Object.fromEntries([...h].map(([f, v]) => [f, clone(v)])) : null
    },
    async hget(key, field) {
      return clone(hashes.get(key)?.get(field))
    },
    async hset(key, fields) {
      const h = hash(key)
      for (const [f, v] of Object.entries(fields)) h.set(f, clone(v))
      return Object.keys(fields).length
    },
    async hdel(key, ...fields) {
      const h = hashes.get(key)
      return fields.filter((f) => h?.delete(f)).length
    },
    async pexpire() {
      return 1
    },
  }
}

const kv = memoryKv()
const api = createHandlers(() => kv)
const URL_ = 'http://localhost/api/orders'

const post = (body, headers = {}) =>
  api.POST(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }))

async function liveOrders() {
  const res = await api.GET(new Request(URL_))
  assert.equal(res.status, 200)
  return (await res.json()).orders
}

const PIZZA = { itemId: 'pizza-36445762', name: 'Chicken bacon ranch pizza', price: 6.5, priceSource: 'listed', qty: 1 }
let n = 0
const studentOrder = (line = PIZZA, extra = {}) => ({
  id: `test-${++n}`,
  student: { name: 'Ana', usfId: '20412253' },
  lines: [line],
  pickupAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  payment: 'dons-dollars',
  ...extra,
})

test('forged price is rejected and never stored', async () => {
  const body = studentOrder({ ...PIZZA, price: 0.01 })
  const res = await post(body)
  assert.equal(res.status, 400)
  assert.ok(!(await liveOrders()).some((o) => o.id === body.id))
})

test('forged status is rejected', async () => {
  const res = await post(studentOrder(PIZZA, { status: 'ready' }))
  assert.equal(res.status, 400)
})

test('valid student order gets server status, total and cubby', async () => {
  const res = await post(studentOrder())
  assert.equal(res.status, 201)
  const order = await res.json()
  assert.equal(order.status, 'received')
  assert.equal(order.total, 6.5)
  assert.ok(Number.isInteger(order.cubby) && order.cubby >= 1 && order.cubby <= 24)
  assert.equal(order.sample, undefined)
})

test('builder line from the UI is accepted at the menu price', async () => {
  const line = { itemId: 'build-your-own', name: 'Bowl', price: 10.6, priceSource: 'listed', qty: 1, details: 'Carne asada · Beans · Rice · Guacamole · Lettuce, Cheese' }
  const res = await post(studentOrder(line))
  assert.equal(res.status, 201)
  assert.equal((await res.json()).total, 10.6)
  const plain = { ...line, price: 9.25, details: 'Carne asada · No beans · No rice' }
  assert.equal((await post(studentOrder(plain))).status, 201)
  assert.equal((await post(studentOrder({ ...line, price: 9.25 }))).status, 400)
})

test('client cubby is rejected', async () => {
  const res = await post(studentOrder(PIZZA, { cubby: 24 }))
  assert.equal(res.status, 400)
})

test('PATCH with an extra total key is rejected and status is unchanged', async () => {
  const created = await (await post(studentOrder())).json()
  const res = await api.PATCH(
    new Request(`${URL_}?id=${encodeURIComponent(created.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-staff-pin': '246810' },
      body: JSON.stringify({ status: 'ready', cubby: 3, total: 0 }),
    }),
  )
  assert.equal(res.status, 400)
  const stored = (await liveOrders()).find((o) => o.id === created.id)
  assert.equal(stored.status, 'received')
  assert.equal(stored.total, 6.5)
})

test('oversized body gets 413 with no stack', async () => {
  const res = await post(studentOrder(PIZZA, { pad: 'x'.repeat(70_000) }))
  assert.equal(res.status, 413)
  const text = await res.text()
  assert.equal(JSON.parse(text).error, 'That request is too large.')
  assert.ok(!/stack|at \w+ \(|\.ts:\d/.test(text))
})

// --- Optional allergy / special request note ---

test('a note is stored trimmed, with control characters stripped, as plain text', async () => {
  const note = '  no cheese,\nplease\u0000\u001b[31m <b>peanut</b> allergy\t '
  const res = await post(studentOrder(PIZZA, { note }))
  assert.equal(res.status, 201)
  const order = await res.json()
  // newlines/escapes become spaces; the HTML is kept as inert text (it is rendered as text, never as HTML)
  assert.equal(order.note, 'no cheese, please  [31m <b>peanut</b> allergy')
  assert.ok([...order.note].every((ch) => ch.charCodeAt(0) > 31))
  const stored = (await liveOrders()).find((o) => o.id === order.id)
  assert.equal(stored.note, order.note)
})

test('exactly 140 characters is accepted; 141 is rejected and never stored', async () => {
  assert.equal((await post(studentOrder(PIZZA, { note: 'a'.repeat(140) }))).status, 201)
  const body = studentOrder(PIZZA, { note: 'a'.repeat(141) })
  const res = await post(body)
  assert.equal(res.status, 400)
  assert.ok(!(await liveOrders()).some((o) => o.id === body.id))
})

test('forged notes are rejected: wrong type, and a note on an unknown key', async () => {
  for (const note of [42, { $gt: '' }, ['a'], null, true]) {
    assert.equal((await post(studentOrder(PIZZA, { note }))).status, 400, JSON.stringify(note))
  }
  assert.equal((await post(studentOrder(PIZZA, { notes: 'x' }))).status, 400)
})

test('a blank note is simply not stored', async () => {
  const res = await post(studentOrder(PIZZA, { note: '   \n\t ' }))
  assert.equal(res.status, 201)
  assert.equal('note' in (await res.json()), false)
})
