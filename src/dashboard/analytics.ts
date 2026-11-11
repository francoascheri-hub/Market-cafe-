// Everything the staff dashboard shows, computed from the orders in the store (no fixed numbers).
// Dates and hours are by pickup time: that's when the kitchen is busy and the sale happens.
import { menu } from '../menu'
import type { Order, PaymentMethod } from '../types'

export type Range = 'today' | '7d' | 'all'

export const BUILD_ITEM_ID = 'build-your-own'
// Peak-hour line wait at Market Café, from the team's own observation
// (11:30–12:45 and 6:30–8:00). Each picked-up pre-order ≈ one student who skipped that line.
export const LINE_MIN_MINUTES = 15
export const LINE_MAX_MINUTES = 25
// Pickup punctuality: picked up within ±5 min of the chosen slot counts as on time.
export const PUNCTUAL_MINUTES = 5
// No-show: a ready order not picked up within 30 min after its slot (or never picked up).
export const NO_SHOW_MINUTES = 30

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { 'dons-dollars': 'Dons Dollars', flexi: 'Flexi' }

const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
export const dayKey = (d: Date | string) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function inRange(o: Order, range: Range, now = new Date()) {
  if (range === 'all') return true
  const start = startOfDay(now)
  if (range === '7d') start.setDate(start.getDate() - 6)
  const pickup = new Date(o.pickupAt)
  return range === 'today' ? pickup.toDateString() === now.toDateString() : pickup >= start
}

// itemId -> station ("picante", "Pizza", ...) from the menu; builds belong to picante.
const STATION = new Map<string, string>()
for (const d of menu.dayparts) for (const s of d.stations) for (const i of s.items) if (!STATION.has(i.id)) STATION.set(i.id, s.name)
export const stationOf = (itemId: string) => STATION.get(itemId) ?? 'other'
export const BUILD_STATION = stationOf(BUILD_ITEM_ID)

const B = menu.burritoBuilder
const PROTEINS = B.proteins.map((p) => p.name)

/** Reads a build's `details` ("Carne asada · Beans · Rice · Guacamole · Lettuce, Cheese"). */
export function parseBuild(details = '') {
  const parts = details.split(' · ').map((p) => p.trim())
  return {
    protein: parts.find((p) => PROTEINS.includes(p)) ?? 'Other',
    guac: parts.includes('Guacamole'),
    toppings: parts.flatMap((p) => p.split(', ')).filter((t) => B.toppings.includes(t)),
  }
}

/** A counted thing: an item, a protein, a topping... `qty` = items ordered. */
export interface Row {
  label: string
  qty: number
  station?: string
}

class Tally {
  private rows = new Map<string, Row>()
  add(key: string, label: string, qty: number, station?: string) {
    const r = this.rows.get(key) ?? { label, qty: 0, station }
    r.qty += qty
    this.rows.set(key, r)
  }
  list() {
    return [...this.rows.values()].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label))
  }
}

/** One station in the "by station" ranking; the build-your-own station also gets its build breakdown. */
export interface StationGroup {
  name: string
  qty: number
  items: Row[]
  build?: { proteins: Row[]; toppings: Row[]; addOns: Row[] }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** 90th percentile (nearest rank). */
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(0.9 * xs.length) - 1] : 0)
const stats = (xs: number[]) => ({ count: xs.length, avgMs: mean(xs), p90Ms: p90(xs) })
const MIN_MS = 60_000

/** Prep time per station. Orders with items from several stations count once for each of them (approximation). */
export interface StationPrep {
  name: string
  count: number
  avgMs: number
  p90Ms: number
}
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN)

export interface Bucket {
  key: string
  label: string
  orders: number
  items: number
}

export function summarize(orders: Order[], range: Range, now = new Date()) {
  const pickedUp = orders.filter((o) => o.status === 'picked-up').length

  const prepTimes = orders.map((o) => ms(o.readyAt) - ms(o.startedAt)).filter((d) => d >= 0)
  const withReady = orders.filter((o) => o.readyAt)
  const onTime = withReady.filter((o) => ms(o.readyAt) <= ms(o.pickupAt)).length

  // Prep time by station (order-level time attributed to every station in the order)
  const prepByStation = new Map<string, number[]>()
  for (const o of orders) {
    const d = ms(o.readyAt) - ms(o.startedAt)
    if (!(d >= 0)) continue
    for (const st of new Set(o.lines.map((l) => stationOf(l.itemId)))) prepByStation.set(st, [...(prepByStation.get(st) ?? []), d])
  }

  // Pickup punctuality (picked-up orders vs their slot), dwell (ready -> picked up), no-shows
  const punctuality = { early: 0, onTime: 0, late: 0 }
  const dwell: number[] = []
  for (const o of orders) {
    if (!o.pickedUpAt) continue
    const off = ms(o.pickedUpAt) - ms(o.pickupAt)
    if (off < -PUNCTUAL_MINUTES * MIN_MS) punctuality.early++
    else if (off > PUNCTUAL_MINUTES * MIN_MS) punctuality.late++
    else punctuality.onTime++
    const w = ms(o.pickedUpAt) - ms(o.readyAt)
    if (w >= 0) dwell.push(w)
  }
  const windowEnd = (o: Order) => ms(o.pickupAt) + NO_SHOW_MINUTES * MIN_MS
  const noShows = withReady.filter((o) => (o.pickedUpAt ? ms(o.pickedUpAt) > windowEnd(o) : now.getTime() > windowEnd(o))).length

  const payments = new Map<string, number>()
  for (const o of orders) payments.set(o.payment, (payments.get(o.payment) ?? 0) + 1)

  const items = new Tally() // one ranking of everything; Burrito and Bowl are items like any other
  const proteins = new Tally()
  const toppings = new Tally()
  const addOns = new Tally()
  const slots = new Map<string, Bucket>()
  const hours = new Map<number, Bucket>()
  const days = new Map<string, Bucket>()
  let itemsSold = 0

  const count = <K>(map: Map<K, Bucket>, key: K, make: () => Bucket, qty: number) => {
    const b = map.get(key) ?? make()
    b.orders++
    b.items += qty
    map.set(key, b)
  }

  for (const o of orders) {
    const pickup = new Date(o.pickupAt)
    const qty = o.lines.reduce((n, l) => n + l.qty, 0)
    const h = pickup.getHours()
    count(hours, h, () => ({ key: String(h), label: hourLabel(h), orders: 0, items: 0 }), qty)
    const dk = dayKey(pickup)
    count(days, dk, () => ({ key: dk, label: dayLabel(pickup), orders: 0, items: 0 }), qty)
    const sk = `${String(h).padStart(2, '0')}:${String(pickup.getMinutes()).padStart(2, '0')}`
    count(slots, sk, () => ({ key: sk, label: timeLabel(pickup), orders: 0, items: 0 }), qty)

    for (const l of o.lines) {
      itemsSold += l.qty
      const station = stationOf(l.itemId)
      if (l.itemId !== BUILD_ITEM_ID) {
        items.add(l.itemId, l.name, l.qty, station)
        continue
      }
      items.add(`build:${l.name}`, l.name, l.qty, station)
      const build = parseBuild(l.details)
      proteins.add(build.protein, build.protein, l.qty)
      for (const t of build.toppings) toppings.add(t, t, l.qty)
      if (build.guac) addOns.add('guac', 'Guacamole', l.qty)
    }
  }

  const ranking = items.list()
  const groups = new Map<string, StationGroup>()
  for (const r of ranking) {
    const name = r.station ?? 'other'
    const g = groups.get(name) ?? { name, qty: 0, items: [] }
    g.qty += r.qty
    g.items.push(r)
    groups.set(name, g)
  }
  const buildGroup = groups.get(BUILD_STATION)
  if (buildGroup) buildGroup.build = { proteins: proteins.list(), toppings: toppings.list(), addOns: addOns.list() }

  // Hours: a continuous axis over the café's opening hours (and any order outside them).
  const openHours = menu.dayparts.flatMap((d) => [Number(d.start.slice(0, 2)), Number(d.end.slice(0, 2))])
  const allHours = [...openHours, ...hours.keys()]
  const hourAxis: Bucket[] = []
  for (let h = Math.min(...allHours); h <= Math.max(...allHours); h++) {
    hourAxis.push(hours.get(h) ?? { key: String(h), label: hourLabel(h), orders: 0, items: 0 })
  }

  // Days: every day of the range, including days without orders.
  const dayAxis: Bucket[] = []
  const dayKeys = [...days.keys()].sort()
  if (range !== 'today' && dayKeys.length) {
    const first = range === '7d' ? startOfDay(new Date(now.getTime() - 6 * 86_400_000)) : new Date(`${dayKeys[0]}T00:00`)
    const lastKey = [dayKey(now), dayKeys.at(-1)!].sort().at(-1)!
    for (const d = new Date(first); dayKey(d) <= lastKey; d.setDate(d.getDate() + 1)) {
      dayAxis.push(days.get(dayKey(d)) ?? { key: dayKey(d), label: dayLabel(d), orders: 0, items: 0 })
    }
  }

  return {
    orders: orders.length,
    itemsSold,
    pickedUp,
    prep: stats(prepTimes),
    prepByStation: [...prepByStation].map(([name, xs]): StationPrep => ({ name, ...stats(xs) })).sort((a, b) => b.count - a.count),
    onTime: { count: onTime, of: withReady.length },
    punctuality,
    dwell: stats(dwell),
    noShow: { count: noShows, of: withReady.length },
    payments: (Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => ({ label: PAYMENT_LABEL[p], qty: payments.get(p) ?? 0 })),
    lineSaved: { min: pickedUp * LINE_MIN_MINUTES, max: pickedUp * LINE_MAX_MINUTES },
    ranking,
    stations: [...groups.values()].sort((a, b) => b.qty - a.qty),
    hours: hourAxis,
    days: dayAxis,
    slots: [...slots.values()].sort((a, b) => a.key.localeCompare(b.key)),
  }
}

export type Summary = ReturnType<typeof summarize>

export const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`
const timeLabel = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function duration(msValue: number) {
  const total = Math.max(0, Math.round(msValue / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "45–75 min", or hours once it gets big ("12.5–20.8 h", "101–169 h"). */
export function minutesRange(min: number, max: number) {
  if (max < 120) return `${min}–${max} min`
  const digits = max >= 600 ? 0 : 1
  return `${(min / 60).toFixed(digits)}–${(max / 60).toFixed(digits)} h`
}

/** Station names come lowercase from the menu data ("grill specials"). */
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Main station of an order: the station of its first line (sides are added after the main item). */
export const mainStation = (o: Order) => (o.lines[0] ? stationOf(o.lines[0].itemId) : 'other')

export interface WeekDay {
  key: string
  label: string // "Mon 11/4"
  total: number
  byStation: Record<string, number>
  byHour: Record<number, number>
}

/**
 * The last 7 days (ending today) whatever range is picked: orders per day split by main station
 * (top `topN` stations, the rest as "other stations") plus a day × hour grid for the heatmap.
 */
export function lastWeek(orders: Order[], now = new Date(), topN = 5) {
  const first = startOfDay(now)
  first.setDate(first.getDate() - 6)
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i)
    const label = `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
    return { key: dayKey(d), label, total: 0, byStation: {}, byHour: {} }
  })
  const index = new Map(days.map((d, i) => [d.key, i]))
  const stationTotals = new Map<string, number>()
  const week = orders.filter((o) => index.has(dayKey(o.pickupAt)))
  for (const o of week) stationTotals.set(mainStation(o), (stationTotals.get(mainStation(o)) ?? 0) + 1)
  const top = [...stationTotals].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name]) => name)
  const OTHER = 'other stations'
  for (const o of week) {
    const day = days[index.get(dayKey(o.pickupAt))!]
    const st = top.includes(mainStation(o)) ? mainStation(o) : OTHER
    const h = new Date(o.pickupAt).getHours()
    day.total++
    day.byStation[st] = (day.byStation[st] ?? 0) + 1
    day.byHour[h] = (day.byHour[h] ?? 0) + 1
  }
  const stations = stationTotals.size > top.length ? [...top, OTHER] : top
  const openHours = menu.dayparts.flatMap((d) => [Number(d.start.slice(0, 2)), Number(d.end.slice(0, 2))])
  const hours: number[] = []
  for (let h = Math.min(...openHours); h <= Math.max(...openHours); h++) hours.push(h)
  return { days, stations, hours, total: week.length }
}
