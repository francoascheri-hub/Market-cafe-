// Demo tool: realistic sample orders for today (up to now) and the 6 days before, so the dashboard
// has something to show. Real menu items, prices and builder options. Seeded orders are stored
// apart from live orders (picked up, or a few "ready" no-shows), so none reach the staff queue,
// the ready board or a cubby.
import { menu } from '../menu'
import type { Daypart, NewOrder, OrderLine, PaymentMethod } from '../types'
import { BUILD_ITEM_ID } from './analytics'

const MIN = 60_000
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const chance = (p: number) => Math.random() < p

function weighted<T>(list: readonly (readonly [T, number])[]): T {
  let r = Math.random() * list.reduce((s, [, w]) => s + w, 0)
  for (const [v, w] of list) if ((r -= w) < 0) return v
  return list[list.length - 1][0]
}

// Pickup demand per half hour (minutes since midnight → weight): busy 11:00–14:00 and 17:00–20:00.
const DEMAND: [number, number][] = [
  [7 * 60, 1], [7.5 * 60, 2], [8 * 60, 3], [8.5 * 60, 3], [9 * 60, 2], [9.5 * 60, 2], [10 * 60, 1.5],
  [11 * 60, 5], [11.5 * 60, 10], [12 * 60, 12], [12.5 * 60, 11], [13 * 60, 7], [13.5 * 60, 5],
  [14 * 60, 2], [14.5 * 60, 1.5], [15 * 60, 1], [15.5 * 60, 1],
  [16.5 * 60, 1.5], [17 * 60, 4], [17.5 * 60, 5], [18 * 60, 6], [18.5 * 60, 8], [19 * 60, 8], [19.5 * 60, 6],
  [20 * 60, 3], [20.5 * 60, 1.5],
]
// Prep minutes [min, max] by station: pastries/fruit are grab-and-go, grill and dinner plates take longest.
const PREP: Record<string, [number, number]> = {
  pastries: [0.5, 1.5], 'hand fruit': [0.5, 1], beverage: [0.5, 1.5], kettles: [1, 3], 'sunrise kettle': [1, 3],
  Pizza: [2, 5], picante: [3, 7], "don's deli sandwiches": [4, 8], griddle: [4, 9], 'griddle scramble special': [5, 10],
  'grill specials': [6, 13], sambal: [5, 10], 'sambal after dark': [5, 10], 'classics dinner': [5, 11],
}
const STATION_OF = new Map(menu.dayparts.flatMap((d) => d.stations.flatMap((s) => s.items.map((i) => [i.id, s.name] as const))))

const PEAK = (m: number) => (m >= 11.5 * 60 && m < 13 * 60) || (m >= 18.5 * 60 && m < 20 * 60)

// How popular each station's mains are (sides are added separately).
const MAIN_STATIONS: Record<string, number> = {
  griddle: 3, 'griddle scramble special': 1.5, 'sunrise kettle': 1, kettles: 0.8, pastries: 1.5,
  'grill specials': 3, Pizza: 3, sambal: 1, "don's deli sandwiches": 1.5,
  'classics dinner': 1, 'sambal after dark': 1.5,
}
const SIDE_STATIONS = ['hand fruit', 'beverage', 'pastries']

const FIRST = ['Maya', 'Diego', 'Ana', 'Sam', 'Priya', 'Jordan', 'Luis', 'Chloe', 'Kenji', 'Fatima', 'Noah', 'Sofia',
  'Ethan', 'Grace', 'Omar', 'Lena', 'Marcus', 'Isabel', 'Tyler', 'Mei', 'Andre', 'Hannah', 'Rafael', 'Zoe']
const LAST = 'ABCDEFGHJKLMNPRSTVW'

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const daypartAt = (m: number): Daypart | undefined => menu.dayparts.find((d) => toMin(d.start) <= m && m <= toMin(d.end))

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
// Earlier items on a station list sell a bit more.
const pickItem = <T,>(list: T[]) => weighted(list.map((x, i) => [x, 1 / (1 + 0.15 * i)] as const))

function buildLine(special: string): OrderLine {
  const B = menu.burritoBuilder
  const protein = weighted(
    B.proteins
      .filter((p) => p.kind !== 'special' || p.name === special) // one rotating special per day
      .map((p) => [p, p.kind === 'everyday' ? 4 : p.kind === 'special' ? 2 : 1.2] as const),
  )
  const guac = chance(0.35)
  const toppingOdds: Record<string, number> = { Lettuce: 0.6, Cheese: 0.7, 'Sour cream': 0.4, 'Pico de gallo': 0.45 }
  const toppings = B.toppings.filter((t) => chance(toppingOdds[t] ?? 0.3))
  const details = [
    protein.name,
    chance(0.85) ? 'Beans' : 'No beans',
    chance(0.8) ? 'Rice' : 'No rice',
    guac && 'Guacamole',
    toppings.length > 0 && toppings.join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    itemId: BUILD_ITEM_ID,
    name: chance(0.55) ? 'Bowl' : 'Burrito',
    price: Math.round((B.basePrice + protein.price + (guac ? B.guacamole.price : 0)) * 100) / 100,
    priceSource: protein.priceSource === 'example' ? 'example' : 'listed',
    qty: 1,
    details,
  }
}

function linesFor(dp: Daypart, special: string): OrderLine[] {
  const lines: OrderLine[] = []
  const hasBuild = dp.stations.some((s) => s.items.some((i) => i.builder))
  if (hasBuild && chance(0.35)) lines.push(buildLine(special))
  else {
    const station = weighted(dp.stations.filter((s) => MAIN_STATIONS[s.name]).map((s) => [s, MAIN_STATIONS[s.name]] as const))
    const item = pickItem(station.items)
    lines.push({ itemId: item.id, name: item.name, price: item.price, priceSource: item.priceSource, qty: station.name === 'Pizza' && chance(0.2) ? 2 : 1 })
  }
  const sides = dp.stations.filter((s) => SIDE_STATIONS.includes(s.name))
  if (sides.length && chance(0.3)) {
    const item = pickItem(pick(sides).items)
    lines.push({ itemId: item.id, name: item.name, price: item.price, priceSource: item.priceSource, qty: 1 })
  }
  return lines
}

function orderAt(day: Date, special: string): NewOrder | null {
  const [start] = weighted(DEMAND.map((d) => [d, d[1]] as const))
  const minute = start + 5 * Math.floor(Math.random() * 6)
  const dp = daypartAt(minute)
  if (!dp) return null
  const pickup = new Date(day.getTime() + minute * MIN)
  // Ordered 15 min to ~2 h ahead; most close to the slot.
  const created = new Date(pickup.getTime() - (15 + Math.random() ** 2 * 100) * MIN - rand(0, 59_000))
  const lines = linesFor(dp, special)
  // Kitchen starts 8–16 min before the slot (5–14 at peak). Prep = the slowest station in the order,
  // a bit slower at peak, sometimes a hiccup.
  const lead = PEAK(minute) ? rand(5, 14) : rand(8, 16)
  const started = new Date(Math.max(created.getTime() + MIN, pickup.getTime() - lead * MIN))
  const slowest = Math.max(...lines.map((l) => {
    const [a, b] = PREP[l.itemId === BUILD_ITEM_ID ? 'picante' : (STATION_OF.get(l.itemId) ?? '')] ?? [3, 8]
    return rand(a, b)
  }))
  const prep = slowest * (PEAK(minute) ? 1.25 : 1) + (chance(0.07) ? rand(3, 8) : 0)
  const ready = new Date(started.getTime() + prep * MIN)
  // Students: ~70% within ±5 min of their slot, ~12% early (if the food is ready), ~14% late, ~4% never come.
  const noShow = chance(0.04)
  const offset = weighted([[rand(-12, -6), 12], [rand(-5, 5), 70], [rand(6, 25), 14]] as const)
  const pickedUp = new Date(Math.max(ready.getTime() + 0.5 * MIN, pickup.getTime() + offset * MIN))
  const payment: PaymentMethod = chance(0.65) ? 'dons-dollars' : 'flexi'
  return {
    id: crypto.randomUUID(),
    student: { name: `${pick(FIRST)} ${pick([...LAST])}.`, usfId: String(20_000_000 + Math.floor(Math.random() * 999_999)) },
    lines,
    total: Math.round(lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100,
    pickupAt: pickup.toISOString(),
    payment,
    status: noShow ? 'ready' : 'picked-up',
    cubby: 1 + Math.floor(Math.random() * 24),
    createdAt: created.toISOString(),
    startedAt: started.toISOString(),
    readyAt: ready.toISOString(),
    ...(noShow ? {} : { pickedUpAt: pickedUp.toISOString() }),
    sample: true,
  }
}

/** Sample orders for today (only ones already picked up by `now`) and the 6 days before. */
export function demoOrders(now = new Date()): NewOrder[] {
  const specials = menu.burritoBuilder.proteins.filter((p) => p.kind === 'special').map((p) => p.name)
  const out: NewOrder[] = []
  for (let back = 6; back >= 0; back--) {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - back)
    const weekday = day.getDay()
    const scale = weekday === 0 || weekday === 6 ? 0.45 : weekday === 5 ? 0.8 : 1
    const count = Math.round(rand(60, 85) * scale)
    const special = pick(specials)
    for (let i = 0; i < count; i++) {
      const o = orderAt(day, special)
      // only orders whose story is over by now (picked up, or no-show window passed)
      const done = o && (o.pickedUpAt ? Date.parse(o.pickedUpAt) : Date.parse(o.pickupAt) + 30 * MIN)
      if (o && done && done < now.getTime()) out.push(o)
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
