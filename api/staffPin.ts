// Shared staff PIN for the queue, dashboard and demo tools. Set STAFF_PIN on the Vercel project.
// Unset or blank means every staff call is refused (fail closed). Never log the PIN or the header.
import { timingSafeEqual } from 'node:crypto'

export const STAFF_HEADER = 'x-staff-pin'

/** null when the request carries the right PIN, else a 401 (same answer for missing and wrong). */
export function staffPinError(req: Request): Response | null {
  const pin = (process.env.STAFF_PIN ?? '').trim()
  const given = req.headers.get(STAFF_HEADER) ?? ''
  if (pin && given) {
    const a = Buffer.from(given, 'utf8')
    const b = Buffer.from(pin, 'utf8')
    if (a.length === b.length && timingSafeEqual(a, b)) return null
  }
  return new Response(JSON.stringify({ error: 'Staff PIN required' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
