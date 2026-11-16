// Dynamic CORS for /api/orders. Origins are echoed only when they match this
// deployment's host, or when they are loopback http (Vite on any port).
// No cookies, no Access-Control-Allow-Origin: *.

const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS'
const ALLOW_HEADERS = 'content-type, x-staff-pin'

function firstHeaderValue(value: string | null): string {
  if (!value) return ''
  return value.split(',')[0]?.trim() ?? ''
}

/** http://localhost:<port> or http://127.0.0.1:<port>, port optional. */
function isLoopbackHttp(origin: string): boolean {
  const match = /^http:\/\/(localhost|127\.0\.0\.1)(?::(\d+))?$/.exec(origin)
  if (!match) return false
  if (match[2] === undefined) return true
  if (!/^(0|[1-9]\d{0,4})$/.test(match[2])) return false
  const port = Number(match[2])
  return port >= 0 && port <= 65535
}

function originHost(origin: string): string | null {
  try {
    const url = new URL(origin)
    if (url.username || url.password) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

function originAllowed(req: Request, origin: string): boolean {
  if (isLoopbackHttp(origin)) return true
  const host = originHost(origin)
  if (!host) return false
  const forwarded = firstHeaderValue(req.headers.get('x-forwarded-host')).toLowerCase()
  const hostHeader = (req.headers.get('host') ?? '').trim().toLowerCase()
  return (forwarded !== '' && host === forwarded) || (hostHeader !== '' && host === hostHeader)
}

/** CORS headers for an allowed Origin. Empty when Origin is missing or not allowed. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !originAllowed(req, origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/**
 * Short-circuit responses:
 * - OPTIONS with no Origin → 204
 * - any method with a disallowed Origin → 403 JSON, no allow-origin header
 * - OPTIONS with an allowed Origin → 204 plus corsHeaders
 * - otherwise null (caller continues and attaches corsHeaders)
 */
export function corsBlock(req: Request): Response | null {
  const origin = req.headers.get('origin')
  if (!origin) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
    return null
  }
  if (!originAllowed(req, origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  return null
}
