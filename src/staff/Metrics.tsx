// Staff dashboard (#/staff/metrics): operational, not financial. Every number is computed from
// the orders in the store and counts orders or items (no $ figures).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Donut, Heatmap, HourlyChart, WeeklyChart } from '../dashboard/charts'
import { COLORS } from '../dashboard/chartTheme'
import {
  capital,
  dayKey,
  duration,
  inRange,
  lastWeek,
  LINE_MAX_MINUTES,
  LINE_MIN_MINUTES,
  minutesRange,
  NO_SHOW_MINUTES,
  PUNCTUAL_MINUTES,
  summarize,
  type Bucket,
  type Range,
  type Row,
  type StationGroup,
} from '../dashboard/analytics'
import { download, ordersCsv, summaryCsv } from '../dashboard/csv'
import { demoOrders } from '../dashboard/seed'
import { useAllOrders } from '../dashboard/useAllOrders'
import { clearSampleOrders, seedSampleOrders } from '../store'
import './metrics.css'

const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: 'all', label: 'All' },
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// "11 AM" -> "11a" so a full day of hours fits on a phone

function Kpi({ name, value, note, wide }: { name: string; value: string; note?: ReactNode; wide?: boolean }) {
  return (
    <div className={`card dash-kpi${wide ? ' dash-kpi-wide' : ''}`}>
      <div className="dash-kpi-name">{name}</div>
      <div className="dash-kpi-value heading">{value}</div>
      {note && <div className="dash-kpi-note">{note}</div>}
    </div>
  )
}

const pct = (qty: number, of: number) => (of ? `${Math.round((qty / of) * 100)}%` : '—')

/** Rows ranked by quantity with their share of the list. */
function QtyTable({ head, rows, limit = 10, showStation = false }: { head: string; rows: Row[]; limit?: number; showStation?: boolean }) {
  const total = rows.reduce((n, r) => n + r.qty, 0)
  if (rows.length === 0) return <p className="muted">No data in this range.</p>
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>{head}</th>
            {showStation && <th>Station</th>}
            <th>Qty</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr key={`${r.station}:${r.label}`}>
              <td>{r.label}</td>
              {showStation && <td>{capital(r.station ?? '')}</td>}
              <td>{r.qty}</td>
              <td>{pct(r.qty, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <p className="muted">
          Top {limit} of {rows.length}. Full list in the Summary CSV.
        </p>
      )}
    </>
  )
}

/** One unified ranking of everything, switchable to an accordion per station. */
function TopItems({ ranking, stations, itemsSold }: { ranking: Row[]; stations: StationGroup[]; itemsSold: number }) {
  const [view, setView] = useState<'all' | 'station'>('all')
  return (
    <section className="card dash-table dash-wide">
      <div className="dash-card-head">
        <h2>Top items by quantity</h2>
        <div className="dash-range dash-range-sm" role="group" aria-label="Group items">
          <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
            All items
          </button>
          <button type="button" aria-pressed={view === 'station'} onClick={() => setView('station')}>
            By station
          </button>
        </div>
      </div>
      {view === 'all' ? (
        <QtyTable head="Item" rows={ranking} limit={15} showStation />
      ) : (
        <div className="dash-stations">
          {stations.map((g) => (
            <details key={g.name} className="dash-station">
              <summary>
                <span className="dash-station-name">{capital(g.name)}</span>
                <span className="muted">
                  {plural(g.qty, 'item')} · {pct(g.qty, itemsSold)}
                </span>
              </summary>
              <QtyTable head="Item" rows={g.items} />
              {g.build && (
                <div className="dash-build">
                  <div>
                    <QtyTable head="Protein" rows={g.build.proteins} />
                  </div>
                  <div>
                    <QtyTable head="Topping" rows={g.build.toppings} />
                  </div>
                  <div>
                    <QtyTable head="Add-on" rows={g.build.addOns} />
                  </div>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Metrics() {
  const { orders: all, loaded, refresh } = useAllOrders()
  const [range, setRange] = useState<Range>('today')
  const [includeSample, setIncludeSample] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // "Today" moves on by itself: re-check the clock once a minute (data changes re-render anyway).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const inView = useMemo(() => all.filter((o) => inRange(o, range, now)), [all, range, now])
  const sampleCount = inView.filter((o) => o.sample).length
  const orders = useMemo(() => (includeSample ? inView : inView.filter((o) => !o.sample)), [inView, includeSample])
  const s = useMemo(() => summarize(orders, range, now), [orders, range, now])
  // Weekly view + heatmap: always the last 7 days (sample toggle still applies)
  const week = useMemo(() => lastWeek(includeSample ? all : all.filter((o) => !o.sample), now), [all, includeSample, now])
  const rangeLabel = RANGES.find((r) => r.id === range)!.label
  const totalSamples = all.filter((o) => o.sample).length

  const peakHour = s.hours.reduce<Bucket | undefined>((best, b) => (b.orders > (best?.orders ?? 0) ? b : best), undefined)
  const busiestSlot = s.slots.reduce<Bucket | undefined>((best, b) => (b.orders > (best?.orders ?? 0) ? b : best), undefined)
  const onTimePct = s.onTime.of ? Math.round((s.onTime.count / s.onTime.of) * 100) : null
  const noShowPct = s.noShow.of ? ((s.noShow.count / s.noShow.of) * 100).toFixed(1) : null
  const pickedUpTotal = s.punctuality.early + s.punctuality.onTime + s.punctuality.late
  const file = (kind: string) => `market-cafe-${kind}-${range}-${dayKey(new Date())}.csv`

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage('')
    try {
      setMessage(await action())
      await refresh()
    } catch {
      setMessage('That didn’t work. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }
  const seed = () =>
    run(async () => {
      await clearSampleOrders() // re-seeding replaces the old sample data instead of doubling it
      const n = await seedSampleOrders(demoOrders())
      return `Added ${plural(n, 'sample order')} (today so far + the 6 days before).`
    })
  const clear = () =>
    run(async () => {
      await clearSampleOrders()
      return 'Sample orders removed. Real orders were kept.'
    })

  return (
    <>
      <header className="header">
        <h1>Market Café · Dashboard</h1>
        <nav className="dash-links">
          <a href="#/staff">Staff view</a>
          <a href="#/board">Ready board</a>
        </nav>
      </header>
      <main className="dash-page">
        <div className="dash-toolbar">
          <div className="dash-range" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="dash-toggle">
            <input type="checkbox" checked={includeSample} onChange={(e) => setIncludeSample(e.target.checked)} />
            Include sample orders
          </label>
        </div>
        <p className="muted dash-note">
          {sampleCount === 0
            ? 'No sample orders in this range.'
            : includeSample
              ? `${plural(sampleCount, 'sample order')} included (made with the demo tools).`
              : `${plural(sampleCount, 'sample order')} hidden. Showing real orders only.`}{' '}
          Dates and hours are by pickup time.
        </p>

        {!loaded ? (
          <p className="muted">Loading orders…</p>
        ) : (
          <>
            <div className="dash-kpis">
              <Kpi name={range === 'today' ? 'Orders today' : 'Orders'} value={String(s.orders)} note={`${plural(s.pickedUp, 'order')} picked up`} />
              <Kpi
                name="Items"
                value={String(s.itemsSold)}
                note={s.orders ? `${(s.itemsSold / s.orders).toFixed(1)} per order` : 'Items ordered'}
              />
              <Kpi
                name="Avg prep time"
                value={s.prep.count ? duration(s.prep.avgMs) : '—'}
                note={s.prep.count ? `p90 ${duration(s.prep.p90Ms)} · started → ready · ${plural(s.prep.count, 'order')}` : 'Started → ready'}
              />
              <Kpi
                name="Ready on time"
                value={onTimePct === null ? '—' : `${onTimePct}%`}
                note={`Food ready by the chosen pickup time · ${s.onTime.count} of ${s.onTime.of}`}
              />
              <Kpi
                name="Wait in cubby"
                value={s.dwell.count ? duration(s.dwell.avgMs) : '—'}
                note={s.dwell.count ? `p90 ${duration(s.dwell.p90Ms)} · ready → picked up, m:ss` : 'Ready → picked up'}
              />
              <Kpi
                name="No-show rate"
                value={noShowPct === null ? '—' : `${noShowPct}%`}
                note={`${s.noShow.count} of ${s.noShow.of} ready orders not picked up within ${NO_SHOW_MINUTES} min of the slot`}
              />
              <Kpi
                wide
                name="Line time saved (estimate)"
                value={minutesRange(s.lineSaved.min, s.lineSaved.max)}
                note={
                  <span className="dash-estimate">
                    Estimate. Assumes each pre-order skips a {LINE_MIN_MINUTES}–{LINE_MAX_MINUTES} min peak-hour line (team observation at
                    Market Café, 11:30–12:45 and 6:30–8:00). {plural(s.pickedUp, 'picked-up order')}.
                  </span>
                }
              />
            </div>

            {s.orders === 0 ? (
              <div className="card dash-empty">
                No orders in this range yet. Orders appear here as students place them, or use “Seed realistic demo day” below.
              </div>
            ) : (
              <>
                <div className="dash-charts">
                  <section className="card">
                    <h2>Demand by pickup hour</h2>
                    <p className="muted">
                      Orders and items to prepare, all days in range{peakHour ? ` · busiest: ${peakHour.label}` : ''}
                    </p>
                    <HourlyChart data={s.hours} />
                  </section>
                  <section className="card">
                    <h2>Last 7 days</h2>
                    <p className="muted">Orders per day by main station, with the daily total as a trend line</p>
                    {week.total ? <WeeklyChart days={week.days} stations={week.stations} /> : <p className="muted dash-chart-empty">No orders in the last 7 days.</p>}
                  </section>
                  <section className="card dash-wide">
                    <h2>Orders by day and hour</h2>
                    <p className="muted">Last 7 days by pickup hour. Hover a cell for the count.</p>
                    <Heatmap days={week.days} hours={week.hours} />
                  </section>
                  <section className="card">
                    <h2>Pickup punctuality</h2>
                    <p className="muted">
                      Pickup vs chosen slot. On time = within ±{PUNCTUAL_MINUTES} min · {plural(pickedUpTotal, 'picked-up order')}
                    </p>
                    <Donut
                      parts={[
                        { label: 'On time', value: s.punctuality.onTime, color: COLORS.green },
                        { label: 'Late', value: s.punctuality.late, color: COLORS.gold },
                        { label: 'Early', value: s.punctuality.early, color: '#93C0A8' },
                      ]}
                    />
                  </section>
                  <section className="card">
                    <h2>Payment mix</h2>
                    <p className="muted">Share of orders by payment method</p>
                    <Donut parts={s.payments.map((p, i) => ({ label: p.label, value: p.qty, color: i === 0 ? COLORS.green : COLORS.gold }))} />
                  </section>
                </div>

                <div className="dash-tables">
                  <TopItems ranking={s.ranking} stations={s.stations} itemsSold={s.itemsSold} />
                  <section className="card dash-table">
                    <h2>Prep time by station</h2>
                    <p className="muted">Started → ready, m:ss. An order with items from several stations counts for each of them.</p>
                    <table>
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Orders</th>
                          <th>Avg</th>
                          <th>p90</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.prepByStation.map((p) => (
                          <tr key={p.name}>
                            <td>{capital(p.name)}</td>
                            <td>{p.count}</td>
                            <td>{duration(p.avgMs)}</td>
                            <td>{duration(p.p90Ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card dash-table">
                    <h2>Orders per pickup slot</h2>
                    {busiestSlot && (
                      <p className="muted">
                        Busiest: {busiestSlot.label} ({plural(busiestSlot.orders, 'order')}){range !== 'today' && ', all days in range'}
                      </p>
                    )}
                    <div className="dash-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Slot</th>
                            <th>Orders</th>
                            <th>Items</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.slots.map((b) => (
                            <tr key={b.key}>
                              <td>{b.label}</td>
                              <td>{b.orders}</td>
                              <td>{b.items}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </>
            )}

            <div className="dash-bottom">
              <section className="card">
                <h2>Export</h2>
                <p className="muted">
                  {rangeLabel}, sample orders {includeSample ? 'included' : 'excluded'}. Opens in Excel or Google Sheets.
                </p>
                <div className="dash-actions">
                  <button
                    type="button"
                    className="btn outline"
                    disabled={s.orders === 0}
                    onClick={() => download(file('orders'), ordersCsv(orders))}
                  >
                    Orders CSV
                  </button>
                  <button
                    type="button"
                    className="btn outline"
                    disabled={s.orders === 0}
                    onClick={() => download(file('summary'), summaryCsv(s, rangeLabel, includeSample))}
                  >
                    Summary CSV
                  </button>
                </div>
                <p className="muted">Orders CSV: one row per item ordered. Summary CSV: the KPIs and tables above.</p>
              </section>

              <section className="card dash-demo">
                <h2>Demo tools</h2>
                <p className="muted">
                  For the class demo only. Sample orders are marked “sample”, already finished (picked up, or a few no-shows) and kept apart from live orders, so they never reach the queue, ready board or cubbies,
                  and numbered from #1001, so real order numbers are not used up.
                </p>
                <div className="dash-actions">
                  <button type="button" className="btn" disabled={busy} onClick={seed}>
                    Seed realistic demo day
                  </button>
                  <button type="button" className="btn outline" disabled={busy || totalSamples === 0} onClick={clear}>
                    Clear sample orders
                  </button>
                </div>
                <p className="muted">Seeding replaces existing sample orders. {plural(totalSamples, 'sample order')} stored now.</p>
                {message && (
                  <p className="dash-message" role="status">
                    {message}
                  </p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  )
}
