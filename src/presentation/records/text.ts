import { typeOf } from '@/domain/catalog'
import { display, type ErpRecord, type Field, type RecordType, type StateTone, type Value } from '@/domain/records'

export type AllRecords = Readonly<Record<string, readonly ErpRecord[]>>

export const ENTITY_NAME: Record<string, string> = { holding: 'Satona Holding', rotama: 'Rotama', rodame: 'Rodame', roasi: 'Roasi' }

export const TONE_COLOR: Record<StateTone, string> = {
  neutral: 'var(--color-series-other)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  accent: 'var(--color-accent)',
}

/** `/modules/tms/trips`, or the record under it. */
export const recordPath = (type: Pick<RecordType, 'key' | 'module'>, id?: string) =>
  `/modules/${type.module}/${type.key.split('.')[1]}${id ? `/${encodeURIComponent(id)}` : ''}`

export function recordTitle(type: RecordType, record: ErpRecord, all?: AllRecords): string {
  const field = type.fields.find((f) => f.key === type.titleField)
  const value = record.values[type.titleField]
  return field ? fieldText(field, value, all) : String(value ?? record.id)
}

export function refTitle(typeKey: string, id: string, all?: AllRecords): string {
  const type = typeOf(typeKey)
  const record = all?.[typeKey]?.find((r) => r.id === id)
  if (!type || !record) return id
  const title = recordTitle(type, record, all)
  return title === id ? id : `${title} · ${id}`
}

/** Display text for any field, resolving refs and entities. */
export function fieldText(field: Field, value: Value | undefined, all?: AllRecords): string {
  if (field.type === 'ref' && field.ref && value) {
    const type = typeOf(field.ref)
    const record = all?.[field.ref]?.find((r) => r.id === value)
    return type && record ? recordTitle(type, record, all) : String(value)
  }
  if (field.type === 'entity' && value) return ENTITY_NAME[String(value)] ?? String(value)
  return display(field, value)
}
