/** Plant KPIs ported from the WIT MES (OEE, downtime) and CMMS (MTBF, MTTR, PM compliance, backlog). */
import type { ErpRecord } from './records'

const num = (r: ErpRecord, k: string) => Number(r.values[k] ?? 0) || 0
const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/** OEE = availability × performance × quality, each averaged over the shift records. */
export function oeeSummary(rows: readonly ErpRecord[]) {
  const a = avg(rows.map((r) => num(r, 'availability')))
  const p = avg(rows.map((r) => num(r, 'performance')))
  const q = avg(rows.map((r) => num(r, 'quality')))
  return { availability: a, performance: p, quality: q, oee: (a * p * q) / 10_000 }
}

/** Average OEE per value of `key` (work centre, shift, date), sorted by `key`. */
export function oeeBy(rows: readonly ErpRecord[], key: string) {
  const groups = new Map<string, ErpRecord[]>()
  for (const r of rows) {
    const k = String(r.values[key] ?? '')
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups].map(([k, rs]) => ({ key: k, ...oeeSummary(rs) })).sort((x, y) => x.key.localeCompare(y.key))
}

/** Largest first, with each item's share and the running share, for a Pareto chart. */
export function pareto(items: ReadonlyArray<{ key: string; value: number }>) {
  const merged = new Map<string, number>()
  for (const i of items) merged.set(i.key, (merged.get(i.key) ?? 0) + i.value)
  const total = [...merged.values()].reduce((s, v) => s + v, 0) || 1
  let run = 0
  return [...merged]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      run += value
      return { key, value, share: value / total, cumulative: run / total }
    })
}

const DONE = new Set(['completed', 'verified', 'closed'])
const OPEN = new Set(['open', 'assigned', 'progress', 'waiting'])
const isFailure = (r: ErpRecord) => r.values.kind === 'Corrective' || r.values.kind === 'Emergency'
const inWindow = (r: ErpRecord, today: string, days: number) => {
  const due = String(r.values.due ?? r.createdAt).slice(0, 10)
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10)
  return due > from && due <= today
}

/**
 * Reliability over the last `days`: MTBF = operating hours / failures (failures are finished corrective or
 * emergency orders; plants run `hoursPerDay`), MTTR = average labour hours per failure, downtime from the orders.
 */
export function reliability(orders: readonly ErpRecord[], assets: number, today: string, days = 90, hoursPerDay = 20) {
  const failures = orders.filter((r) => isFailure(r) && DONE.has(r.status) && inWindow(r, today, days))
  const operating = assets * days * hoursPerDay
  return {
    failures: failures.length,
    mtbf: failures.length ? operating / failures.length : operating,
    mttr: avg(failures.map((r) => num(r, 'labourHours'))),
    downtime: failures.reduce((s, r) => s + num(r, 'downtimeHours'), 0),
  }
}

/** Preventive orders due in the window that are finished, over all preventive orders due in it. */
export function pmCompliance(orders: readonly ErpRecord[], today: string, days = 30) {
  const due = orders.filter((r) => r.values.kind === 'Preventive' && inWindow(r, today, days) && r.status !== 'cancelled')
  return { due: due.length, done: due.filter((r) => DONE.has(r.status)).length, rate: due.length ? due.filter((r) => DONE.has(r.status)).length / due.length : 1 }
}

/** Open labour hours against weekly crew capacity (technicians × 40 h × wrench time). */
export function backlog(orders: readonly ErpRecord[], technicians: number, wrenchTime = 0.55) {
  const open = orders.filter((r) => OPEN.has(r.status))
  const hours = open.reduce((s, r) => s + Math.max(num(r, 'labourHours'), 1), 0)
  const capacity = technicians * 40 * wrenchTime
  return { open: open.length, hours, capacity, weeks: capacity ? hours / capacity : 0 }
}

/** Planned share of finished work: everything except corrective and emergency. */
export function workMix(orders: readonly ErpRecord[]) {
  const done = orders.filter((r) => DONE.has(r.status))
  const unplanned = done.filter(isFailure).length
  return { planned: done.length - unplanned, unplanned, plannedShare: done.length ? (done.length - unplanned) / done.length : 0 }
}

const SEVERITY_POINTS: Record<string, number> = { Low: 1, Medium: 3, High: 6, Critical: 10 }

/**
 * Driver safety score from ADAS and DSM events: 100 minus two points per severity point
 * (Low 1, Medium 3, High 6, Critical 10), floored at 0. False alarms do not count.
 */
export function safetyScores(events: readonly ErpRecord[]) {
  const by = new Map<string, { driver: string; events: number; points: number }>()
  for (const e of events) {
    if (e.status === 'false') continue
    const d = String(e.values.driver ?? '')
    const cur = by.get(d) ?? { driver: d, events: 0, points: 0 }
    cur.events += 1
    cur.points += SEVERITY_POINTS[String(e.values.severity)] ?? 1
    by.set(d, cur)
  }
  return [...by.values()].map((x) => ({ ...x, score: Math.max(0, 100 - x.points * 2) })).sort((a, b) => a.score - b.score)
}

/** Events per hour of the day, 0 to 23. */
export const byHour = (events: readonly ErpRecord[]) => Array.from({ length: 24 }, (_, h) => events.filter((e) => Number(e.values.hour) === h).length)

const dayMs = 86_400_000
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Counts per calendar month for the `months` months ending at `today`, oldest first. */
export function perMonth(rows: readonly ErpRecord[], today: string, months: number, dateOf: (r: ErpRecord) => string) {
  const end = new Date(`${today}T00:00:00Z`)
  return Array.from({ length: months }, (_, i) => {
    const month = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1 - i), 1)).toISOString().slice(0, 7)
    return { month, count: rows.filter((r) => dateOf(r).slice(0, 7) === month).length }
  })
}

/** Counts per day for the `days` days ending at `today`, oldest first. */
export function perDay(rows: readonly ErpRecord[], today: string, days: number, dateOf: (r: ErpRecord) => string) {
  const end = new Date(`${today}T00:00:00Z`).getTime()
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(dateOf(r).slice(0, 10), (counts.get(dateOf(r).slice(0, 10)) ?? 0) + 1)
  return Array.from({ length: days }, (_, i) => {
    const day = isoDay(end - (days - 1 - i) * dayMs)
    return { day, count: counts.get(day) ?? 0 }
  })
}

const RECORDABLE = ['Fatality', 'Lost time injury', 'Medical treatment']

/** SHE lagging indicators: LTIFR per 1,000,000 and TRIR per 200,000 hours worked, days since the last lost-time injury. */
export function safetyRates(incidents: readonly ErpRecord[], manHours: number, today: string) {
  const lti = incidents.filter((r) => r.values.kind === 'Lost time injury' || r.values.kind === 'Fatality')
  const recordable = incidents.filter((r) => RECORDABLE.includes(String(r.values.kind)))
  const last = lti.map((r) => String(r.values.date)).sort().at(-1)
  const lostDays = incidents.reduce((s, r) => s + num(r, 'lostDays'), 0)
  return {
    lti: lti.length,
    recordable: recordable.length,
    ltifr: manHours ? (lti.length * 1e6) / manHours : 0,
    trir: manHours ? (recordable.length * 2e5) / manHours : 0,
    severity: manHours ? (lostDays * 1e6) / manHours : 0,
    daysSinceLti: last ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${last}T00:00:00Z`).getTime()) / dayMs) : null,
  }
}

/** Counts per level of the safety pyramid, worst first, with unsafe acts and conditions from observations at the base. */
export function safetyPyramid(incidents: readonly ErpRecord[], observations: readonly ErpRecord[], kinds: readonly string[]) {
  return [
    ...kinds.map((kind) => ({ kind, count: incidents.filter((r) => r.values.kind === kind).length })),
    { kind: 'Unsafe acts & conditions', count: observations.filter((o) => o.values.kind !== 'Safe behaviour').length },
  ]
}

/** Rows whose date field falls within `days` of today (already past counts as due), soonest first. */
export function dueWithin(rows: readonly ErpRecord[], field: string, today: string, days: number) {
  const limit = isoDay(new Date(`${today}T00:00:00Z`).getTime() + days * dayMs)
  return rows.filter((r) => r.values[field] && String(r.values[field]) <= limit).sort((a, b) => String(a.values[field]).localeCompare(String(b.values[field])))
}

/** Open items by days past due: not yet due, 1-30, 31-60 and over 60, with the summed amount. */
export function aging(rows: readonly ErpRecord[], dueField: string, amountField: string, today: string) {
  const buckets = [
    { label: 'Not due', count: 0, amount: 0 },
    { label: '1-30 days', count: 0, amount: 0 },
    { label: '31-60 days', count: 0, amount: 0 },
    { label: 'Over 60 days', count: 0, amount: 0 },
  ]
  const now = new Date(`${today}T00:00:00Z`).getTime()
  for (const r of rows) {
    const late = Math.floor((now - new Date(`${String(r.values[dueField])}T00:00:00Z`).getTime()) / dayMs)
    const b = buckets[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3]!
    b.count += 1
    b.amount += num(r, amountField)
  }
  return buckets
}

/** The ISO day `n` days from `today` (negative goes back). */
export const shiftDay = (today: string, n: number) => isoDay(new Date(`${today}T00:00:00Z`).getTime() + n * dayMs)
