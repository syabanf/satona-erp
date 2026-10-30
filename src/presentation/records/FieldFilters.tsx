import { X } from 'lucide-react'
import { filterKind, splitRange, type FilterKind, type Where } from '@/domain/filters'
import type { ErpRecord, Field, RecordType } from '@/domain/records'
import { Input, Select } from '../ui/Field'
import { fieldText, type AllRecords } from './text'

interface Props {
  type: RecordType
  rows: readonly ErpRecord[]
  all?: AllRecords
  where: Where
  onChange: (key: string, value: string | undefined) => void
}

/** The values a pick filter offers: the field's options, or the values the rows hold, with how many rows hold each. */
function choices(field: Field, rows: readonly ErpRecord[], all?: AllRecords) {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = String(r.values[field.key] ?? '')
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const values = field.options?.length ? [...field.options] : [...counts.keys()].sort()
  return values.map((v) => ({ value: v, label: `${fieldText(field, v, all)} (${counts.get(v) ?? 0})` }))
}

/** A readable form of one active filter, for its chip. */
function filterLabel(field: Field, kind: FilterKind, value: string, all?: AllRecords) {
  if (kind === 'pick') return fieldText(field, value, all)
  if (kind === 'text') return `contains "${value}"`
  const [min, max] = splitRange(value)
  const show = (v: string) => (kind === 'range' ? fieldText({ ...field, type: field.type === 'computed' ? 'number' : field.type }, Number(v), all) : v)
  if (min && max) return `${show(min)} to ${show(max)}`
  return min ? `from ${show(min)}` : `up to ${show(max)}`
}

/** Removable chips for the field filters in force. */
export function FilterTags({ type, rows, all, where, onChange }: Props) {
  return Object.entries(where).map(([key, value]) => {
    const field = type.fields.find((f) => f.key === key)
    if (!field) return null
    return (
      <span key={key} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-invert pr-1 pl-3 text-xs font-medium text-on-invert">
        <span className="truncate">
          {field.label}: {filterLabel(field, filterKind(field, rows), value, all)}
        </span>
        <button type="button" aria-label={`Remove the ${field.label.toLowerCase()} filter`} onClick={() => onChange(key, undefined)} className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/15">
          <X aria-hidden className="size-3.5" />
        </button>
      </span>
    )
  })
}

/** One control per field of the record type, so a list filters on any aspect of its records. */
export function FieldFilters({ type, rows, all, where, onChange }: Props) {
  return (
    <div className="grid gap-3 border-b border-line bg-raised/50 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {type.fields.map((field) => {
        const kind = filterKind(field, rows)
        const value = where[field.key] ?? ''
        const id = `filter-${field.key}`
        const label = (
          <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
            {field.label}
            {field.unit && <span className="text-subtle"> ({field.unit})</span>}
          </label>
        )
        if (kind === 'pick')
          return (
            <div key={field.key}>
              {label}
              <Select id={id} compact className="w-full" value={value} onChange={(e) => onChange(field.key, e.target.value || undefined)} options={[{ value: '', label: 'Any' }, ...choices(field, rows, all)]} />
            </div>
          )
        if (kind === 'text')
          return (
            <div key={field.key}>
              {label}
              <Input id={id} className="h-10" placeholder="Contains…" value={value} onChange={(e) => onChange(field.key, e.target.value || undefined)} />
            </div>
          )
        const [min, max] = splitRange(value)
        const set = (lo: string, hi: string) => onChange(field.key, lo || hi ? `${lo}..${hi}` : undefined)
        const inputType = kind === 'dates' ? 'date' : 'number'
        return (
          <div key={field.key}>
            {label}
            <div className="flex items-center gap-1.5">
              <Input id={id} type={inputType} className="h-10 min-w-0 flex-1" placeholder="From" aria-label={`${field.label} from`} value={min} onChange={(e) => set(e.target.value, max)} />
              <span className="text-xs text-subtle">to</span>
              <Input type={inputType} className="h-10 min-w-0 flex-1" placeholder="To" aria-label={`${field.label} to`} value={max} onChange={(e) => set(min, e.target.value)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
