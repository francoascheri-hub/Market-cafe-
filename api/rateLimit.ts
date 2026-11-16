// Fixed-window limits for order and staff calls, plus caps on how many orders Redis keeps.
// Another handler owns the routes and calls these; this file never talks to Redis itself.

const WINDOW_MS = 60_000
const KEY_TTL_MS = 70_000

const DEFAULT_LIMITS = { order: 60, staff: 180, live: 500, sample: 800 }

type Limits = { order?: number; staff?: number; live?: number; sample?: number }
type Bucket = 'order' | 'staff'
type StoreKind = 'live' | 'sample'

let testLimits: Limits | null = null

const MESSAGES: Record<Bucket | StoreKind, string> = {
  order: 'Too many orders right now. Wait a moment and try again.',
  staff: 'Too many staff requests. Wait a moment and try again.',
  live: "The café can't take more orders right now. Ask staff to clear the demo.",
  sample: 'Too many sample orders are stored. Clear sample orders first.',
}

/** Test hook. Pass null to restore the classroom defaults. */
export function setLimitsForTests(limits: Limits | null): void {
  testLimits = limits
}

function limit(name: keyof typeof DEFAULT_LIMITS): number {
  return testLimits?.[name] ?? DEFAULT_LIMITS[name]
}

function tooMany(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** x-real-ip, else the last x-forwarded-for hop, else local. Only IP characters, 64 max. */
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  const forwarded = req.headers.get('x-forwarded-for')
  const raw = real ?? (forwarded == null ? '' : (forwarded.split(',').at(-1) ?? ''))
  const ip = raw.replace(/[^0-9a-fA-F:.]/g, '').slice(0, 64)
  return ip || 'local'
}

export async function rateLimitError(
  req: Request,
  kv: { incr(key: string): Promise<number>; pexpire?: (key: string, ms: number) => Promise<unknown> },
  bucket: Bucket,
): Promise<Response | null> {
  const key = `mc:rl:${bucket}:${clientIp(req)}:${Math.floor(Date.now() / WINDOW_MS)}`
  const count = await kv.incr(key)
  if (count === 1 && kv.pexpire) await kv.pexpire(key, KEY_TTL_MS)
  if (count > limit(bucket)) return tooMany(MESSAGES[bucket])
  return null
}

export function storageCapError(kind: StoreKind, current: number, adding: number): Response | null {
  if (current + adding > limit(kind)) return tooMany(MESSAGES[kind])
  return null
}
