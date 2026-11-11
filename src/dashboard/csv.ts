// Client-side CSV exports (opens in Excel / Google Sheets).
import type { Order } from '../types'
import { capital, duration, NO_SHOW_MINUTES, PAYMENT_LABEL, PUNCTUAL_MINUTES, stationOf, type Bucket, type Row, type Summary } from './analytics'

type Cell = string | number | boolean | undefined
const cell = (v: Cell) => {
  const s = v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

const local = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function download(filename: string, rows: Cell[][]) {
  // BOM so Excel reads "Café" and "·" correctly
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** One row per line item. */
export function ordersCsv(orders: Order[]): Cell[][] {
  const rows: Cell[][] = [
    ['Order #', 'Created', 'Pickup', 'Status', 'Payment', 'Sample', 'Item', 'Station', 'Details', 'Qty'],
  ]
  for (const o of [...orders].sort((a, b) => a.pickupAt.localeCompare(b.pickupAt) || a.number - b.number)) {
    for (const l of o.lines) {
      rows.push([
        o.number, local(o.createdAt), local(o.pickupAt), o.status, PAYMENT_LABEL[o.payment] ?? o.payment, o.sample ? 'yes' : 'no',
        l.name, capital(stationOf(l.itemId)), l.details, l.qty,
      ])
    }
  }
  return rows
}

const share = (qty: number, of: number) => (of ? `${Math.round((qty / of) * 100)}%` : '')
const table = (title: string, head: string, list: Row[], withStation = false): Cell[][] => {
  const of = list.reduce((n, r) => n + r.qty, 0)
  return [
    [],
    [title],
    withStation ? [head, 'Station', 'Qty', 'Share'] : [head, 'Qty', 'Share'],
    ...list.map((r) => (withStation ? [r.label, capital(r.station ?? ''), r.qty, share(r.qty, of)] : [r.label, r.qty, share(r.qty, of)])),
  ]
}
const buckets = (title: string, head: string, list: Bucket[]): Cell[][] => [
  [],
  [title],
  [head, 'Orders', 'Items'],
  ...list.map((b) => [b.label, b.orders, b.items]),
]

export function summaryCsv(s: Summary, rangeLabel: string, includeSample: boolean): Cell[][] {
  return [
    ['Market Café pre-order summary'],
    ['Range', rangeLabel],
    ['Sample orders', includeSample ? 'included' : 'excluded'],
    ['Exported', local(new Date().toISOString())],
    [],
    ['KPI', 'Value'],
    ['Orders', s.orders],
    ['Items', s.itemsSold],
    ['Avg prep time (start to ready, m:ss)', s.prep.count ? duration(s.prep.avgMs) : ''],
    ['P90 prep time (m:ss)', s.prep.count ? duration(s.prep.p90Ms) : ''],
    ['Ready on time % (ready by pickup time)', s.onTime.of ? ((s.onTime.count / s.onTime.of) * 100).toFixed(1) : ''],
    ['Avg dwell, ready to picked up (m:ss)', s.dwell.count ? duration(s.dwell.avgMs) : ''],
    ['P90 dwell, ready to picked up (m:ss)', s.dwell.count ? duration(s.dwell.p90Ms) : ''],
    [`No-show % (ready, not picked up within ${NO_SHOW_MINUTES} min of slot)`, s.noShow.of ? ((s.noShow.count / s.noShow.of) * 100).toFixed(1) : ''],
    [],
    [`Pickup punctuality (picked up vs slot, on time = within +/-${PUNCTUAL_MINUTES} min)`],
    ['Group', 'Orders', 'Share'],
    ...([['Early', s.punctuality.early], ['On time', s.punctuality.onTime], ['Late', s.punctuality.late]] as const).map(([k, n]) => [
      k, n, share(n, s.punctuality.early + s.punctuality.onTime + s.punctuality.late),
    ]),
    ...table('Payment mix (% of orders)', 'Payment', s.payments),
    [],
    ['Prep time by station (multi-station orders count for each station)'],
    ['Station', 'Orders', 'Avg (m:ss)', 'P90 (m:ss)'],
    ...s.prepByStation.map((p) => [capital(p.name), p.count, duration(p.avgMs), duration(p.p90Ms)]),
    ['Picked up', s.pickedUp],
    ['Line time saved, min (estimate: picked up x 15-25 min)', `${s.lineSaved.min}-${s.lineSaved.max}`],
    ...table('Top items by quantity (all stations)', 'Item', s.ranking, true),
    ...table('Items by station', 'Station', s.stations.map((g) => ({ label: capital(g.name), qty: g.qty }))),
    ...s.stations.flatMap((g) => [
      ...table(`Station: ${capital(g.name)}`, 'Item', g.items),
      ...(g.build
        ? [
            ...table(`Station: ${capital(g.name)} - build your own: protein`, 'Protein', g.build.proteins),
            ...table(`Station: ${capital(g.name)} - build your own: toppings`, 'Topping', g.build.toppings),
            ...table(`Station: ${capital(g.name)} - build your own: add-ons`, 'Add-on', g.build.addOns),
          ]
        : []),
    ]),
    ...buckets('By pickup hour', 'Hour', s.hours),
    ...(s.days.length ? buckets('By day', 'Day', s.days) : []),
    ...buckets('Orders per pickup slot', 'Slot', s.slots),
  ]
}
