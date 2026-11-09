import menuJson from './data/menu.json'
import type { Daypart, Menu } from './types'

export const menu = menuJson as Menu

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const PREP_MINUTES = 15

/** Earliest pickup (now + prep time) as minutes since midnight; may exceed 24h. */
const earliest = (date: Date) => date.getHours() * 60 + date.getMinutes() + PREP_MINUTES

/** True when every daypart today is over, so orders are for tomorrow. */
const closedForToday = (date: Date) => menu.dayparts.every((d) => earliest(date) > toMinutes(d.end))

/** Daypart you can still order for today (open now or next), else tomorrow's Lunch. */
export function daypartFor(date = new Date()): Daypart {
  const t = earliest(date)
  return (
    menu.dayparts.find((d) => t <= toMinutes(d.end)) ??
    menu.dayparts.find((d) => d.label === 'Lunch') ??
    menu.dayparts[0]
  )
}

/** Up to `count` pickup slots every 5 min inside the daypart's hours, ≥15 min from now. */
export function pickupSlots(count = 6, from = new Date()): Date[] {
  const dp = daypartFor(from)
  const day = new Date(from)
  day.setHours(0, 0, 0, 0)
  if (closedForToday(from)) day.setDate(day.getDate() + 1)
  const atMinutes = (m: number) => new Date(day.getTime() + m * 60_000)
  const startMin = closedForToday(from) ? toMinutes(dp.start) : Math.max(earliest(from), toMinutes(dp.start))
  const first = Math.ceil(startMin / 5) * 5
  const slots: Date[] = []
  for (let m = first; m <= toMinutes(dp.end) && slots.length < count; m += 5) slots.push(atMinutes(m))
  return slots
}

export const isTomorrow = (d: Date, now = new Date()) => d.toDateString() !== now.toDateString()

export const formatTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export const formatPrice = (n: number) => `$${n.toFixed(2)}`
