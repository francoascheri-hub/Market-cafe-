// Request validation for /api/orders. Every price, total and status is decided here or in orders.ts,
// never taken from the client. Errors are short fixed strings: no stack, no field dump.
import menuJson from '../src/data/menu.json' with { type: 'json' }
import type { Menu, OrderLine, OrderStatus, PaymentMethod, PriceSource, Student } from '../src/types.js'

export const MAX_JSON_BYTES = 65_536
export const MAX_BULK_BYTES = 1_000_000

const menu = menuJson as unknown as Menu
const B = menu.burritoBuilder
const BUILD_ITEM_ID = 'build-your-own'
const MAX_LINES = 8
const MAX_QTY = 10
const MAX_BULK_ORDERS = 800
const PICKUP_WINDOW_MS = 8 * 24 * 60 * 60 * 1000
const CUBBY_COUNT = 24

const ORDER_ERROR = "That order doesn't look right."
const PATCH_ERROR = "That update doesn't look right."
const BULK_ERROR = 'Invalid sample orders'

type Fail = { ok: false; error: string }
type CatalogItem = { name: string; price: number; priceSource: PriceSource }

/** A validated order with server prices; orders.ts adds number, status, cubby and timestamps. */
export interface OrderDraft {
  id: string
  student: Student
  lines: OrderLine[]
  pickupAt: string
  payment: PaymentMethod
  total: number
}

export interface SampleDraft extends OrderDraft {
  status: 'ready' | 'picked-up'
  createdAt?: string
  startedAt?: string
  readyAt?: string
  pickedUpAt?: string
}

const cents = (n: number) => Math.round(n * 100) / 100
const sameCents = (a: number, b: number) => Math.abs(a - b) < 0.005

// Menu lookup by id. An id listed twice is used only when every copy agrees on name and price.
const CATALOG = new Map<string, CatalogItem | null>()
for (const daypart of menu.dayparts) {
  for (const station of daypart.stations) {
    for (const item of station.items) {
      if (item.builder || item.id === BUILD_ITEM_ID) continue
      const prev = CATALOG.get(item.id)
      const next = { name: item.name, price: cents(item.price), priceSource: item.priceSource }
      if (prev === undefined) CATALOG.set(item.id, next)
      else if (prev && (prev.name !== next.name || prev.price !== next.price || prev.priceSource !== next.priceSource)) {
        CATALOG.set(item.id, null)
      }
    }
  }
}

const PROTEINS = new Map(B.proteins.map((p) => [p.name, p]))
const TOPPINGS = new Set(B.toppings)
const BUILD_FLAGS = new Set(['Beans', 'No beans', 'Rice', 'No rice', 'Guacamole'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const onlyKeys = (o: Record<string, unknown>, allowed: ReadonlySet<string>) => Object.keys(o).every((k) => allowed.has(k))
const isoOf = (v: unknown) => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)

// --- Body reading ---

export type JsonResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }

const TOO_LARGE = { ok: false, status: 413, error: 'That request is too large.' } as const
const BAD_JSON = { ok: false, status: 400, error: "That request doesn't look right." } as const

/** Reads at most maxBytes of the body (Content-Length is checked too, but not trusted). */
export async function readJson(req: Request, maxBytes: number): Promise<JsonResult> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE
  if (!req.body) return BAD_JSON
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return TOO_LARGE
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return BAD_JSON
  }
}

// --- Lines ---

const LINE_KEYS = new Set(['itemId', 'name', 'price', 'priceSource', 'qty', 'details'])

/** Builder details: "<protein> · Beans|No beans · Rice|No rice · [Guacamole] · [topping, topping]". */
function parseBuild(raw: Record<string, unknown>): OrderLine | null {
  if (typeof raw.name !== 'string' || !B.types.includes(raw.name)) return null
  if (raw.qty !== 1) return null
  if (typeof raw.details !== 'string' || raw.details.length > 300) return null
  const [proteinName, ...rest] = raw.details.split(' · ')
  const protein = PROTEINS.get(proteinName)
  if (!protein) return null
  const flags = new Set<string>()
  let toppingsSeen = false
  for (const part of rest) {
    if (BUILD_FLAGS.has(part)) {
      if (flags.has(part)) return null
      flags.add(part)
      continue
    }
    if (toppingsSeen) return null
    const toppings = part.split(', ')
    if (!toppings.every((t) => TOPPINGS.has(t)) || new Set(toppings).size !== toppings.length) return null
    toppingsSeen = true
  }
  if ((flags.has('Beans') && flags.has('No beans')) || (flags.has('Rice') && flags.has('No rice'))) return null
  const price = cents(B.basePrice + protein.price + (flags.has('Guacamole') ? B.guacamole.price : 0))
  const priceSource: PriceSource = protein.priceSource === 'example' ? 'example' : 'listed'
  if (raw.price !== undefined && (typeof raw.price !== 'number' || !sameCents(raw.price, price))) return null
  if (raw.priceSource !== undefined && raw.priceSource !== priceSource) return null
  return { itemId: BUILD_ITEM_ID, name: raw.name, price, priceSource, qty: 1, details: raw.details }
}

function parseLine(raw: unknown): OrderLine | null {
  if (!isObject(raw) || !onlyKeys(raw, LINE_KEYS)) return null
  const { itemId, qty } = raw
  if (typeof itemId !== 'string' || !Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) return null
  if (itemId === BUILD_ITEM_ID) return parseBuild(raw)
  const item = CATALOG.get(itemId)
  if (!item || raw.name !== item.name || raw.details !== undefined) return null
  if (raw.price !== undefined && (typeof raw.price !== 'number' || !sameCents(raw.price, item.price))) return null
  if (raw.priceSource !== undefined && raw.priceSource !== item.priceSource) return null
  return { itemId, name: item.name, price: item.price, priceSource: item.priceSource, qty: qty as number }
}

function parseLines(raw: unknown): OrderLine[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LINES) return null
  const lines: OrderLine[] = []
  for (const r of raw) {
    const line = parseLine(r)
    if (!line) return null
    lines.push(line)
  }
  return lines
}

const linesTotal = (lines: OrderLine[]) => cents(lines.reduce((s, l) => s + l.price * l.qty, 0))

// --- Shared order fields ---

const STUDENT_KEYS = new Set(['name', 'usfId'])

function parseStudent(raw: unknown): Student | null {
  if (!isObject(raw) || !onlyKeys(raw, STUDENT_KEYS)) return null
  if (typeof raw.name !== 'string' || typeof raw.usfId !== 'string') return null
  const name = raw.name.trim()
  if (name.length < 1 || name.length > 40 || !/^\d{8}$/.test(raw.usfId)) return null
  return { name, usfId: raw.usfId }
}

/** id, student, lines, pickupAt (any valid date), payment. */
function parseCore(o: Record<string, unknown>): OrderDraft | null {
  if (typeof o.id !== 'string' || o.id.length < 1 || o.id.length > 80) return null
  const student = parseStudent(o.student)
  const lines = parseLines(o.lines)
  const pickupAt = isoOf(o.pickupAt)
  if (!student || !lines || !pickupAt) return null
  if (o.payment !== 'dons-dollars' && o.payment !== 'flexi') return null
  return { id: o.id, student, lines, pickupAt, payment: o.payment, total: linesTotal(lines) }
}

// --- Student / staff-sample POST ---

const STUDENT_KEYS_TOP = new Set(['id', 'student', 'lines', 'pickupAt', 'payment'])
// Staff "Add sample order" sends the whole draft; these extra keys are ignored (sample must be true).
const SAMPLE_KEYS_TOP = new Set([...STUDENT_KEYS_TOP, 'sample', 'status', 'cubby', 'total', 'createdAt'])

export function parseStudentOrder(
  value: unknown,
  opts: { allowSample?: boolean } = {},
): { ok: true; draft: OrderDraft } | Fail {
  const fail: Fail = { ok: false, error: ORDER_ERROR }
  if (!isObject(value)) return fail
  if (opts.allowSample) {
    if (!onlyKeys(value, SAMPLE_KEYS_TOP) || value.sample !== true) return fail
  } else if (!onlyKeys(value, STUDENT_KEYS_TOP)) return fail
  const draft = parseCore(value)
  if (!draft) return fail
  if (Math.abs(Date.parse(draft.pickupAt) - Date.now()) > PICKUP_WINDOW_MS) return fail
  return { ok: true, draft }
}

// --- Staff PATCH ---

const STATUSES: OrderStatus[] = ['received', 'preparing', 'ready', 'picked-up']
// The server stamps status times itself, so client timestamps are ignored rather than rejected.
const PATCH_KEYS = new Set(['status', 'cubby', 'startedAt', 'readyAt', 'pickedUpAt'])

export function parseStaffPatch(value: unknown): { ok: true; patch: { status?: OrderStatus; cubby?: number } } | Fail {
  const fail: Fail = { ok: false, error: PATCH_ERROR }
  if (!isObject(value) || !onlyKeys(value, PATCH_KEYS)) return fail
  const { status, cubby } = value
  if (status === undefined && cubby === undefined) return fail
  if (status !== undefined && !STATUSES.includes(status as OrderStatus)) return fail
  if (cubby !== undefined && (!Number.isInteger(cubby) || (cubby as number) < 1 || (cubby as number) > CUBBY_COUNT)) return fail
  const patch: { status?: OrderStatus; cubby?: number } = {}
  if (status !== undefined) patch.status = status as OrderStatus
  if (cubby !== undefined) patch.cubby = cubby as number
  return { ok: true, patch }
}

// --- Dashboard bulk samples ---

const BULK_ORDER_KEYS = new Set([
  'id', 'student', 'lines', 'pickupAt', 'payment', 'total', 'status',
  'createdAt', 'startedAt', 'readyAt', 'pickedUpAt', 'sample', 'cubby',
])
const TIMESTAMPS = ['createdAt', 'startedAt', 'readyAt', 'pickedUpAt'] as const

function parseSample(raw: unknown): SampleDraft | null {
  if (!isObject(raw) || !onlyKeys(raw, BULK_ORDER_KEYS)) return null
  if (raw.sample !== undefined && raw.sample !== true) return null
  if (raw.status !== undefined && raw.status !== 'ready' && raw.status !== 'picked-up') return null
  const core = parseCore(raw)
  if (!core) return null
  // Seeded totals are summed in the browser; allow one cent of float drift.
  if (raw.total !== undefined && (typeof raw.total !== 'number' || Math.abs(raw.total - core.total) > 0.0101)) return null
  const draft: SampleDraft = { ...core, status: raw.status === 'ready' ? 'ready' : 'picked-up' }
  for (const key of TIMESTAMPS) {
    if (raw[key] === undefined) continue
    const at = isoOf(raw[key])
    if (!at) return null
    draft[key] = at
  }
  return draft // client cubby is ignored
}

export function parseSampleBulk(value: unknown): { ok: true; drafts: SampleDraft[] } | Fail {
  const fail: Fail = { ok: false, error: BULK_ERROR }
  if (!isObject(value) || !onlyKeys(value, new Set(['orders']))) return fail
  const { orders } = value
  if (!Array.isArray(orders) || orders.length < 1 || orders.length > MAX_BULK_ORDERS) return fail
  const drafts: SampleDraft[] = []
  for (const o of orders) {
    const d = parseSample(o)
    if (!d) return fail
    drafts.push(d)
  }
  return { ok: true, drafts }
}
