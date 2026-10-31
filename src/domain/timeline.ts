/** Time spans for the Gantt view: when each record starts and ends, worked out from its own fields. */
import type { ErpRecord, Field, RecordType } from './records'

export type SpanKind = 'range' | 'duration' | 'milestone' | 'lifetime'
export interface Span {
  start: string
  end: string
  kind: SpanKind
}

const DAY = 86_400_000
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

/** A number field that says how long the record lasts; an interval between visits is not a duration. */
const durationField = (type: RecordType): Field | undefined =>
  type.fields.find((f) => f.type === 'number' && /^(h|days)$/.test(f.unit ?? '') && f.key !== 'interval')

/** What the bars mean for this type, for the view's caption. */
export function spanRule(type: RecordType): { kind: SpanKind; label: string } {
  const dates = type.fields.filter((f) => f.type === 'date')
  if (dates.length >= 2) return { kind: 'range', label: `${dates[0]!.label} s/d ${dates[1]!.label}` }
  const dur = durationField(type)
  if (dates[0] && dur) return { kind: 'duration', label: `${dates[0].label} + ${dur.label}` }
  if (dates[0]) return { kind: 'milestone', label: dates[0].label }
  return { kind: 'lifetime', label: 'dibuat s/d terakhir diubah' }
}

/**
 * Start and end of each record: two date fields make a range; a date plus a duration in hours or days makes a bar
 * that long; a single date is a one-day milestone; without dates the bar runs from creation to the last update.
 */
export function spanOf(type: RecordType): (r: ErpRecord) => Span | undefined {
  const dates = type.fields.filter((f) => f.type === 'date')
  const dur = durationField(type)
  const rule = spanRule(type).kind
  return (r) => {
    const v = (f?: Field) => (f ? String(r.values[f.key] ?? '').slice(0, 10) : '')
    const start = rule === 'lifetime' ? r.createdAt.slice(0, 10) : v(dates[0])
    if (!start) return undefined
    let end = start
    if (rule === 'range') end = v(dates[1]) || start
    else if (rule === 'duration') {
      const n = Number(r.values[dur!.key]) || 0
      end = addDays(start, Math.max(0, Math.ceil(dur!.unit === 'h' ? n / 24 : n) - 1))
    } else if (rule === 'lifetime') end = r.updatedAt.slice(0, 10)
    return end < start ? { start: end, end: start, kind: rule } : { start, end, kind: rule }
  }
}
