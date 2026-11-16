// Staff PIN on /api/orders: loads the real handlers through Vite with an in-memory Redis.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PIN = '246810'
process.env.STAFF_PIN = PIN // before orders.ts (and staffPin.ts) load

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

/** Same in-memory Redis as scripts/memory-api-plugin.mjs (JSON values like Upstash), incl. pexpire. */
function memoryKv() {
  const data = new Map()
  const parse = (v) => (v == null ? null : JSON.parse(v))
  return {
    async get(k) { return parse(data.get(k)) },
    async incr(k) { return this.incrby(k, 1) },
    async incrby(k, by) { const n = (parse(data.get(k)) ?? 0) + by; data.set(k, JSON.stringify(n)); return n },
    async set(k, v, { nx, px } = {}) {
      if (nx && data.has(k)) return null
      data.set(k, JSON.stringify(v))
      if (px) setTimeout(() => data.get(k) === JSON.stringify(v) && data.delete(k), px).unref()
      return 'OK'
    },
    async pexpire(k, ms) {
      if (!data.has(k)) return 0
      setTimeout(() => data.delete(k), ms).unref()
      return 1
    },
    async del(...ks) { return ks.filter((k) => data.delete(k)).length },
    async hgetall(k) {
      const h = data.get(k)
      return h ? Object.fromEntries([...h].map(([f, v]) => [f, JSON.parse(v)])) : null
    },
    async hget(k, f) { return parse(data.get(k)?.get(f)) },
    async hset(k, values) {
      const h = data.get(k) ?? new Map()
      data.set(k, h)
      for (const [f, v] of Object.entries(values)) h.set(f, JSON.stringify(v))
      return Object.keys(values).length
    },
    async hdel(k, ...fs) { return fs.filter((f) => data.get(k)?.delete(f)).length },
  }
}

const kv = memoryKv()
const api = createHandlers(() => kv)

const send = (method, query = '', { body, pin } = {}) => {
  const headers = { 'x-real-ip': '10.9.0.1' }
  if (body) headers['content-type'] = 'application/json'
  if (pin !== undefined) headers['x-staff-pin'] = pin
  return api[method](
    new Request(`http://localhost/api/orders${query}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
}

/** Only the fields the server accepts from a student. */
const studentOrder = () => ({
  id: randomUUID(),
  student: { name: 'Maya', usfId: '20481234' },
  lines: [{ itemId: 'pizza-36445762', name: 'Chicken bacon ranch pizza', price: 6.5, priceSource: 'listed', qty: 1 }],
  pickupAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  payment: 'dons-dollars',
})

const statusOf = async (id) => {
  const res = await send('GET', '?scope=all&since=-1', { pin: PIN })
  assert.equal(res.status, 200)
  return (await res.json()).orders.find((o) => o.id === id)?.status
}

test('student order and live list stay public', async () => {
  const res = await send('POST', '', { body: studentOrder() })
  assert.equal(res.status, 201)
  assert.equal((await res.json()).status, 'received')

  const live = await send('GET')
  assert.equal(live.status, 200)
})

test('PATCH needs the staff PIN', async () => {
  const draft = studentOrder()
  assert.equal((await send('POST', '', { body: draft })).status, 201)
  const query = `?id=${encodeURIComponent(draft.id)}`

  const missing = await send('PATCH', query, { body: { status: 'preparing' } })
  assert.equal(missing.status, 401)
  assert.equal(missing.headers.get('content-type'), 'application/json')
  assert.deepEqual(await missing.json(), { error: 'Staff PIN required' })
  assert.equal(await statusOf(draft.id), 'received')

  const wrong = await send('PATCH', query, { body: { status: 'preparing' }, pin: '000000' })
  assert.equal(wrong.status, 401)
  assert.deepEqual(await wrong.json(), { error: 'Staff PIN required' })
  assert.equal(await statusOf(draft.id), 'received')

  const ok = await send('PATCH', query, { body: { status: 'preparing' }, pin: PIN })
  assert.equal(ok.status, 200)
  assert.equal(await statusOf(draft.id), 'preparing')
})

test('DELETE, bulk seed and full history need the staff PIN', async () => {
  assert.equal((await send('DELETE')).status, 401)
  assert.equal((await send('DELETE', '?sample=1')).status, 401)
  assert.equal((await send('POST', '?bulk=1', { body: { orders: [] } })).status, 401)
  assert.equal((await send('GET', '?scope=all&since=-1')).status, 401)
  assert.equal((await send('GET', '?scope=all&since=-1', { pin: `${PIN}0` })).status, 401)
})
