/** Month grids for the calendar view of any record type with a date. */
import type { ErpRecord, Field, RecordType } from './records'

/** The date a record is planned or happened on: the type's insight date, else its first date field. */
export const dateFieldOf = (type: RecordType): Field | undefined =>
  type.fields.find((f) => f.key === type.insight.dateField && f.type === 'date') ?? type.fields.find((f) => f.type === 'date')

/** Weeks of a month, Monday first, as ISO days; days outside the month are null. */
export function monthGrid(month: string): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7)
}

/** Records grouped by their day, in id order. */
export function byDay(rows: readonly ErpRecord[], field: Field): Map<string, ErpRecord[]> {
  const out = new Map<string, ErpRecord[]>()
  for (const r of rows) {
    const day = String(r.values[field.key] ?? '').slice(0, 10)
    if (day) out.set(day, [...(out.get(day) ?? []), r])
  }
  return out
}
