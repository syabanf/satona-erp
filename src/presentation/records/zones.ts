import type { ErpRecord, Field, RecordType } from '@/domain/records'
import { fieldText, type AllRecords } from './text'

const MAX_ZONES = 12

/** The field that splits records into zones: the type's chart grouping, else its first pick, company or reference field. */
export const zoneField = (type: RecordType): Field | undefined =>
  type.fields.find((f) => f.key === type.insight.groupBy && ['select', 'entity', 'ref'].includes(f.type)) ?? type.fields.find((f) => ['select', 'entity', 'ref'].includes(f.type))

/** Records grouped into zones by `zoneField`, largest first; past twelve zones the rest fold into "Lainnya". Used by the shopfloor and the floor plan. */
export function zonesOf(type: RecordType, rows: readonly ErpRecord[], all: AllRecords) {
  const field = zoneField(type)
  const by = new Map<string, ErpRecord[]>()
  for (const r of rows) {
    const k = field ? String(r.values[field.key] ?? '') || '(kosong)' : 'Semua'
    by.set(k, [...(by.get(k) ?? []), r])
  }
  const sorted = [...by].sort((a, b) => b[1].length - a[1].length)
  const rest = sorted.slice(MAX_ZONES - 1).flatMap(([, rs]) => rs)
  const label = (k: string) => (field && k !== '(kosong)' ? fieldText(field, k, all) : k)
  return [...sorted.slice(0, MAX_ZONES - 1).map(([k, rs]) => ({ id: k, label: label(k), rows: rs })), ...(rest.length ? [{ id: '__rest', label: 'Lainnya', rows: rest }] : [])]
}
