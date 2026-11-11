// Dashboard charts (Recharts). USF palette: a Dons Green ramp for series, Dons Gold for the one
// thing to notice (busiest hour, the daily trend line). No animations; hover tooltips on everything.
import type { ReactNode } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { capital, hourLabel, type Bucket, type WeekDay } from './analytics'
import { COLORS, stationColor } from './chartTheme'


const axisTick = { fill: COLORS.axis, fontSize: 12 }
type TipProps = TooltipContentProps<TooltipValueType, string | number>
// The data row behind the hovered bar/slice (our own row objects).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hovered = (p: TipProps): any => (p.active ? p.payload?.[0]?.payload : undefined)

/** Small HTML legend (kept outside the SVG so it wraps nicely). */
function ChartLegend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((i) => (
        <li key={i.label}>
          <i className={i.line ? 'line' : undefined} style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
const shortHour = (h: number) => hourLabel(h).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p')

/** Tooltip card shared by all charts. */
function TipCard({ title, rows }: { title: ReactNode; rows: { color: string; label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className={`chart-tip-row${r.strong ? ' strong' : ''}`}>
          <i style={{ background: r.color }} />
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

/** Orders per pickup hour (bars, busiest in gold) with the items to prepare as a line. */
export function HourlyChart({ data }: { data: Bucket[] }) {
  const rows = data.map((b) => ({ hour: Number(b.key), label: b.label, orders: b.orders, items: b.items }))
  const peak = Math.max(0, ...rows.map((r) => r.orders))
  return (
    <>
      <ChartLegend
        items={[
          { label: 'Orders', color: '#C6CCC9' },
          { label: 'Busiest hour', color: COLORS.gold },
          { label: 'Items to prepare', color: COLORS.ink, line: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="hour" tickFormatter={shortHour} tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.grid }} interval={0} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(0, 84, 60, 0.06)' }}
          content={(p: TipProps) => {
            const r = hovered(p)
            return r ? (
              <TipCard
                title={`${r.label} pickups`}
                rows={[
                  { color: r.orders === peak ? COLORS.gold : '#C6CCC9', label: 'Orders', value: r.orders },
                  { color: COLORS.ink, label: 'Items', value: r.items },
                ]}
              />
            ) : null
          }}
        />
        <Bar dataKey="orders" name="Orders" radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.hour} fill={peak > 0 && r.orders === peak ? COLORS.gold : '#C6CCC9'} />
          ))}
        </Bar>
        <Line dataKey="items" name="Items" stroke={COLORS.ink} strokeWidth={1.5} dot={false} type="monotone" isAnimationActive={false} />
      </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

/** Last 7 days: orders per day stacked by main station, plus the daily total as a trend line. */
export function WeeklyChart({ days, stations }: { days: WeekDay[]; stations: string[] }) {
  // Every station gets a value (0 if none) so the stack order is the same on every day
  const rows = days.map((d) => ({ label: d.label, total: d.total, ...Object.fromEntries(stations.map((st) => [st, d.byStation[st] ?? 0])) }))
  return (
    <>
      <ChartLegend
        items={[
          ...stations.map((st, i) => ({ label: capital(st), color: stationColor(st, i) })),
          { label: 'Daily total (trend)', color: COLORS.gold, line: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={270}>
      {/* key: remount when the station set changes, so the stack order always follows `stations` */}
      <ComposedChart key={stations.join('|')} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.grid }} interval={0} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(0, 84, 60, 0.06)' }}
          content={(p: TipProps) => {
            const r = hovered(p)
            return r ? (
              <TipCard
                title={r.label}
                rows={[
                  ...stations
                    .map((s, i) => ({ color: stationColor(s, i), label: capital(s), value: (r[s] as number) ?? 0 }))
                    .filter((x) => x.value > 0)
                    .reverse(),
                  { color: COLORS.gold, label: 'Total orders', value: r.total, strong: true },
                ]}
              />
            ) : null
          }}
        />
        {stations.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            name={capital(s)}
            stackId="orders"
            fill={stationColor(s, i)}
            maxBarSize={56}
            isAnimationActive={false}
            radius={i === stations.length - 1 ? [3, 3, 0, 0] : 0}
          />
        ))}
        <Line
          dataKey="total"
          name="Daily total (trend)"
          stroke={COLORS.gold}
          strokeWidth={2.5}
          dot={{ r: 4, fill: COLORS.gold, stroke: '#fff', strokeWidth: 1.5 }}
          activeDot={{ r: 5 }}
          type="linear"
          isAnimationActive={false}
        />
      </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

/** Day × hour grid of orders; darker green = more orders. Hover a cell for the exact count. */
export function Heatmap({ days, hours }: { days: WeekDay[]; hours: number[] }) {
  const max = Math.max(1, ...days.flatMap((d) => hours.map((h) => d.byHour[h] ?? 0)))
  return (
    <div className="heatmap" role="table" aria-label="Orders by day and pickup hour">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `76px repeat(${hours.length}, minmax(0, 1fr))` }}>
        <span role="columnheader" />
        {hours.map((h) => (
          <span key={h} className="heatmap-hour" role="columnheader">
            {shortHour(h)}
          </span>
        ))}
        {days.map((d) => (
          <div key={d.key} role="row" className="heatmap-row">
            <span className="heatmap-day" role="rowheader">
              {d.label}
            </span>
            {hours.map((h) => {
              const n = d.byHour[h] ?? 0
              const t = n / max
              return (
                <span
                  key={h}
                  role="cell"
                  className="heatmap-cell"
                  data-tip={`${d.label}, ${hourLabel(h)}: ${n} ${n === 1 ? 'order' : 'orders'}`}
                  style={{ background: n ? `rgba(0, 84, 60, ${0.1 + 0.9 * t})` : undefined, color: t > 0.45 ? '#fff' : COLORS.ink }}
                >
                  {n || ''}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-scale" aria-hidden>
        <span>Fewer</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((a) => (
          <i key={a} style={{ background: `rgba(0, 84, 60, ${a})` }} />
        ))}
        <span>More orders</span>
      </div>
    </div>
  )
}

/** Donut with the leading share in the middle and a legend with counts and %. */
export function Donut({ parts, unit = 'orders' }: { parts: { label: string; value: number; color: string }[]; unit?: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0)
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : '—')
  const lead = parts.reduce((a, b) => (b.value > a.value ? b : a), parts[0])
  return (
    <div className="donut">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={parts.filter((p) => p.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={1.5}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <Cell key={p.label} fill={p.color} />
                ))}
            </Pie>
            <Tooltip
              content={(tp: TipProps) => {
                const p = hovered(tp)
                return p ? <TipCard title={p.label} rows={[{ color: p.color, label: unit, value: `${p.value} · ${pct(p.value)}` }]} /> : null
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {total > 0 && (
          <div className="donut-center" aria-hidden>
            <b>{pct(lead.value)}</b>
            <span>{lead.label}</span>
          </div>
        )}
      </div>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} aria-hidden />
            <span>{p.label}</span>
            <b>{pct(p.value)}</b>
            <span className="muted">
              {p.value} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
