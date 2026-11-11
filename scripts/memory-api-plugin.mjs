// Test helper: serves the real /api/orders handlers from the Vite dev server with an
// in-memory Redis stand-in, so e2e can test the shared-backend mode without Upstash.
// Not used by `npm run dev` (that stays localStorage) or in production.

/** Minimal in-memory version of the Redis commands api/orders.ts uses (JSON values like Upstash). */
export function memoryKv() {
  const data = new Map()
  const parse = (v) => (v == null ? null : JSON.parse(v))
  return {
    async get(k) { return parse(data.get(k)) },
    async incr(k) { return this.incrby(k, 1) },
    async incrby(k, by) { const n = (parse(data.get(k)) ?? 0) + by; data.set(k, JSON.stringify(n)); return n },
    async set(k, v, { nx, px }) {
      if (nx && data.has(k)) return null
      data.set(k, JSON.stringify(v))
      setTimeout(() => data.get(k) === JSON.stringify(v) && data.delete(k), px)
      return 'OK'
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

export function memoryApiPlugin() {
  const kv = memoryKv()
  return {
    name: 'memory-api',
    configureServer(server) {
      server.middlewares.use('/api/orders', async (req, res) => {
        const { createHandlers } = await server.ssrLoadModule('/api/orders.ts')
        const handler = createHandlers(() => kv)[req.method]
        if (!handler) return void res.writeHead(405).end()
        const chunks = []
        for await (const c of req) chunks.push(c)
        const body = chunks.length ? Buffer.concat(chunks) : undefined
        const response = await handler(
          new Request(`http://localhost${req.originalUrl}`, { method: req.method, headers: req.headers, body }),
        )
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}
