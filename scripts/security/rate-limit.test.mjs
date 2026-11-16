// Loads api/rateLimit.ts through Vite (no Redis, no orders.ts).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../..', import.meta.url))
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { rateLimitError, storageCapError, setLimitsForTests } = await vite.ssrLoadModule('/api/rateLimit.ts')

after(async () => {
  setLimitsForTests(null)
  await vite.close()
})

/** In-memory incr + pexpire. pexpireCalls records every expiry write. */
function memoryKv() {
  const counts = new Map()
  const pexpireCalls = []
  return {
    pexpireCalls,
    async incr(key) {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return next
    },
    async pexpire(key, ms) {
      pexpireCalls.push({ key, ms })
    },
  }
}

const request = (ip) => new Request('http://localhost/api/orders', { headers: { 'x-real-ip': ip } })

test('per-IP windows and storage caps', async () => {
  setLimitsForTests({ order: 3 })
  const orders = memoryKv()
  const hit = (ip) => rateLimitError(request(ip), orders, 'order')

  assert.equal(await hit('10.0.0.8'), null)
  assert.equal(await hit('10.0.0.8'), null)
  assert.equal(await hit('10.0.0.8'), null)

  const blocked = await hit('10.0.0.8')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get('content-type'), 'application/json')
  assert.equal(blocked.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await blocked.json(), { error: 'Too many orders right now. Wait a moment and try again.' })
  assert.equal(await hit('10.1.0.9'), null)
  assert.equal(orders.pexpireCalls.length, 2)
  assert.ok(orders.pexpireCalls.every((call) => call.ms === 70_000 && call.key.startsWith('mc:rl:order:')))

  setLimitsForTests({ staff: 1 })
  const staff = memoryKv()
  assert.equal(await rateLimitError(request('10.0.0.8'), staff, 'staff'), null)
  const staffBlocked = await rateLimitError(request('10.0.0.8'), staff, 'staff')
  assert.equal(staffBlocked.status, 429)
  assert.deepEqual(await staffBlocked.json(), { error: 'Too many staff requests. Wait a moment and try again.' })

  const full = storageCapError('live', 500, 1)
  assert.equal(full.status, 429)
  assert.deepEqual(await full.json(), {
    error: "The café can't take more orders right now. Ask staff to clear the demo.",
  })
  assert.equal(storageCapError('live', 499, 1), null)

  setLimitsForTests(null)
})
