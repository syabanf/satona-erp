/** Per-field filters for record lists: one value per field, kept in a single URL parameter. */
import type { ErpRecord, Field, RecordType } from './records'

export type FilterKind = 'pick' | 'range' | 'dates' | 'text'
export type Where = Readonly<Record<string, string>>

/** How a field filters: option and reference fields pick one value, numbers and dates take a range, text matches a word. */
export function filterKind(field: Field, rows: readonly ErpRecord[]): FilterKind {
  if (field.type === 'select' || field.type === 'entity' || field.type === 'ref') return 'pick'
  if (field.type === 'number' || field.type === 'money') return 'range'
  if (field.type === 'date') return 'dates'
  if (field.type === 'computed') return rows.some((r) => typeof r.values[field.key] === 'number') ? 'range' : 'pick'
  return 'text'
}

/** `amount:100..500;entity:roasi` with each value URI-encoded, so colons and semicolons in values survive. */
export function parseWhere(raw: string | undefined): Where {
  if (!raw) return {}
  return Object.fromEntries(
    raw
      .split(';')
      .map((part) => part.split(':'))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k!, decodeURIComponent(v!)]),
  )
}

export const serializeWhere = (where: Where) =>
  Object.entries(where)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${encodeURIComponent(v)}`)
    .join(';') || undefined

/** `min..max` with either side open. */
export const splitRange = (v: string): [string, string] => {
  const [min = '', max = ''] = v.split('..')
  return [min, max]
}

function matches(kind: FilterKind, raw: unknown, wanted: string) {
  if (kind === 'pick') return String(raw ?? '') === wanted
  if (kind === 'text') return String(raw ?? '').toLowerCase().includes(wanted.toLowerCase())
  const [min, max] = splitRange(wanted)
  if (kind === 'dates') {
    const d = String(raw ?? '')
    return Boolean(d) && (!min || d >= min) && (!max || d <= max)
  }
  const n = Number(raw)
  return Number.isFinite(n) && (min === '' || n >= Number(min)) && (max === '' || n <= Number(max))
}

/** Rows that pass every field filter; unknown field keys are ignored. */
export function applyWhere(type: RecordType, rows: readonly ErpRecord[], where: Where): ErpRecord[] {
  const checks = Object.entries(where).flatMap(([key, wanted]) => {
    const field = type.fields.find((f) => f.key === key)
    return field && wanted ? [{ key, wanted, kind: filterKind(field, rows) }] : []
  })
  return rows.filter((r) => checks.every((c) => matches(c.kind, r.values[c.key], c.wanted)))
}
