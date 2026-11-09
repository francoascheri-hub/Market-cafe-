import menuJson from './data/menu.json'
import type { Daypart, Menu } from './types'

export const menu = menuJson as Menu

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Daypart open at `date`, else the next one today, else Lunch (so demos work any time). */
export function daypartFor(date = new Date()): Daypart {
  const now = date.getHours() * 60 + date.getMinutes()
  return (
    menu.dayparts.find((d) => now >= toMinutes(d.start) && now < toMinutes(d.end)) ??
    menu.dayparts.find((d) => now < toMinutes(d.start)) ??
    menu.dayparts.find((d) => d.label === 'Lunch') ??
    menu.dayparts[0]
  )
}

/** Next `count` pickup slots, every 5 min, starting ≥15 min from now (kitchen prep time). */
export function pickupSlots(count = 6, from = new Date()): Date[] {
  const first = new Date(from.getTime() + 15 * 60_000)
  first.setSeconds(0, 0)
  first.setMinutes(Math.ceil(first.getMinutes() / 5) * 5)
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * 5 * 60_000))
}

export const formatTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export const formatPrice = (n: number) => `$${n.toFixed(2)}`
