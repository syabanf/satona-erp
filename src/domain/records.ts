/** The record engine: one schema per record type, generic rules for validation, workflow and insight. */
import { can, type Access } from './erp'

export type Value = string | number
export type Values = Record<string, Value | undefined>

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'ref' | 'entity' | 'computed'

export interface Field {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: readonly string[]
  unit?: string
  /** Record type key a `ref` field points at. */
  ref?: string
  min?: number
  max?: number
  /** Shown as a table column. */
  list?: boolean
  /** Derives the value of a `computed` field from the others. */
  compute?: (values: Values) => Value
  /** Marks the ref that places a record under its parent; without it the first required ref does. */
  parent?: boolean
}

export type StateTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent'

export interface Workflow {
  initial: string
  states: ReadonlyArray<{ id: string; label: string; tone: StateTone }>
  transitions: ReadonlyArray<{ from: string; to: string; label: string; needs: 'full' | 'approve' }>
}

export interface RecordType {
  key: string
  module: string
  /** Master data feeds transactions; transactions move through workflows. */
  area: 'master' | 'transaction'
  name: string
  singular: string
  prefix: string
  titleField: string
  fields: readonly Field[]
  workflow: Workflow
  insight: { sumField?: string; groupBy?: string; dateField?: string }
  /** Portal users (drivers, operators) may create these, such as their own check-ins or fault reports. */
  portalCreate?: boolean
}

export interface HistoryEntry {
  at: string
  by: string
  action: string
}

export interface ErpRecord {
  id: string
  type: string
  status: string
  values: Values
  createdAt: string
  updatedAt: string
  history: readonly HistoryEntry[]
}

export const canCreate = (type: Pick<RecordType, 'portalCreate'>, access: Access) => can(access, 'create') || (access === 'portal' && Boolean(type.portalCreate))

const isEmpty = (v: Value | undefined) => v === undefined || v === ''

/** Field errors keyed by field, empty when the values pass. */
export function validate(type: RecordType, values: Values): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of type.fields) {
    if (f.type === 'computed') continue
    const v = values[f.key]
    if (isEmpty(v)) {
      if (f.required) errors[f.key] = `${f.label} is required`
      continue
    }
    if (f.type === 'number' || f.type === 'money') {
      const n = Number(v)
      if (!Number.isFinite(n)) errors[f.key] = `${f.label} must be a number`
      else if (f.min !== undefined && n < f.min) errors[f.key] = `${f.label} must be at least ${f.min}`
      else if (f.max !== undefined && n > f.max) errors[f.key] = `${f.label} must be at most ${f.max}`
    }
    if (f.type === 'select' && f.options && !f.options.includes(String(v))) errors[f.key] = `Pick a ${f.label.toLowerCase()} from the list`
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[f.key] = `${f.label} must be a date`
  }
  return errors
}

/** Numbers stored as numbers, computed fields filled in. */
export function computeValues(type: RecordType, values: Values): Values {
  const out: Values = {}
  for (const f of type.fields) {
    const v = values[f.key]
    if (f.type === 'computed') continue
    out[f.key] = isEmpty(v) ? undefined : f.type === 'number' || f.type === 'money' ? Number(v) : String(v)
  }
  for (const f of type.fields) if (f.type === 'computed' && f.compute) out[f.key] = f.compute(out)
  return out
}

export function allowedTransitions(type: RecordType, status: string, access: Access) {
  return type.workflow.transitions.filter((t) => t.from === status && can(access, t.needs === 'approve' ? 'approve' : 'step'))
}

export const stateOf = (type: RecordType, status: string) => type.workflow.states.find((s) => s.id === status)

/** Display text of a value, without resolving refs. */
export function display(field: Field, value: Value | undefined): string {
  if (isEmpty(value)) return '·'
  if (field.type === 'money' || field.unit === 'Rp') return `Rp ${Math.round(Number(value)).toLocaleString('id-ID')}`
  if (field.type === 'number' || (field.type === 'computed' && typeof value === 'number')) {
    const n = Number(value)
    const text = Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    return field.unit ? `${text} ${field.unit}` : text
  }
  return String(value)
}

export interface RecordCriteria {
  status?: string
  q?: string
  /** Exact matches on select or entity fields. */
  where?: Record<string, string | undefined>
}

export function filterRecords(rows: readonly ErpRecord[], { status, q, where = {} }: RecordCriteria) {
  const needle = q?.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (!status || r.status === status) &&
      Object.entries(where).every(([k, v]) => !v || String(r.values[k] ?? '') === v) &&
      (!needle || r.id.toLowerCase().includes(needle) || Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(needle))),
  )
}

export function sortRecords(rows: readonly ErpRecord[], key: string | undefined, dir: 'asc' | 'desc' = 'asc') {
  if (!key) return [...rows]
  const get = (r: ErpRecord) => (key === 'id' ? r.id : key === 'status' ? r.status : r.values[key])
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    if (x === y) return 0
    if (x === undefined) return 1
    if (y === undefined) return -1
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign
  })
}

export interface Summary {
  count: number
  byStatus: Record<string, number>
  sum: number
  byGroup: Array<{ key: string; count: number; sum: number }>
  /** Records per month for the last `months` months ending at `today`, oldest first. */
  monthly: Array<{ month: string; count: number; sum: number }>
}

export function summarize(type: RecordType, rows: readonly ErpRecord[], today: string, months = 6): Summary {
  const { sumField, groupBy, dateField } = type.insight
  const amount = (r: ErpRecord) => (sumField ? Number(r.values[sumField] ?? 0) || 0 : 0)
  const byStatus: Record<string, number> = {}
  const groups = new Map<string, { count: number; sum: number }>()
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (groupBy) {
      const k = String(r.values[groupBy] ?? 'None')
      const g = groups.get(k) ?? { count: 0, sum: 0 }
      groups.set(k, { count: g.count + 1, sum: g.sum + amount(r) })
    }
  }
  const end = new Date(`${today}T00:00:00Z`)
  const monthly = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1 - i), 1))
    const month = d.toISOString().slice(0, 7)
    const inMonth = rows.filter((r) => String((dateField ? r.values[dateField] : undefined) ?? r.createdAt).slice(0, 7) === month)
    return { month, count: inMonth.length, sum: inMonth.reduce((s, r) => s + amount(r), 0) }
  })
  return {
    count: rows.length,
    byStatus,
    sum: rows.reduce((s, r) => s + amount(r), 0),
    byGroup: [...groups].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.count - a.count),
    monthly,
  }
}

/** PREFIX-0001, one above the highest number in use. */
export function nextId(type: Pick<RecordType, 'prefix'>, rows: readonly ErpRecord[]): string {
  const top = rows.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0)
  return `${type.prefix}-${String(top + 1).padStart(4, '0')}`
}

/** Records of any type whose ref fields point at `id`. */
export function referencedBy(id: string, types: readonly RecordType[], all: Readonly<Record<string, readonly ErpRecord[]>>) {
  return types.flatMap((t) => {
    const refs = t.fields.filter((f) => f.type === 'ref')
    if (!refs.length) return []
    return (all[t.key] ?? []).filter((r) => refs.some((f) => r.values[f.key] === id)).map((record) => ({ type: t, record }))
  })
}

/** Records waiting on a step that needs approval, which `accessFor` lets the role take. */
export function awaitingApproval(types: readonly RecordType[], all: Readonly<Record<string, readonly ErpRecord[]>>, accessFor: (module: string) => Access) {
  return types.flatMap((type) => {
    const access = accessFor(type.module)
    if (!can(access, 'approve')) return []
    return (all[type.key] ?? []).flatMap((record) => {
      const moves = allowedTransitions(type, record.status, access).filter((t) => t.needs === 'approve')
      return moves.length ? [{ type, record, moves }] : []
    })
  })
}

type AllRecords = Readonly<Record<string, readonly ErpRecord[]>>

/** The ref that files a record under its parent (warehouse for a zone, zone for a bin). */
export function parentField(type: RecordType): Field | undefined {
  const refs = type.fields.filter((f) => f.type === 'ref')
  return refs.find((f) => f.parent) ?? refs.find((f) => f.required && f.ref !== type.key)
}

/** Parent, grandparent and so on, nearest last, e.g. company › plant › warehouse for a zone. */
export function ancestors(type: RecordType, record: ErpRecord, types: readonly RecordType[], all: AllRecords) {
  const chain: Array<{ type: RecordType; record: ErpRecord }> = []
  const seen = new Set([record.id])
  let t: RecordType | undefined = type
  let r: ErpRecord | undefined = record
  while (t && r && chain.length < 8) {
    const f = parentField(t)
    const id: Value | undefined = f ? r.values[f.key] : undefined
    const pt: RecordType | undefined = f?.ref ? types.find((x) => x.key === f.ref) : undefined
    const pr: ErpRecord | undefined = pt && id ? all[pt.key]?.find((x) => x.id === id) : undefined
    if (!pt || !pr || seen.has(pr.id)) break
    seen.add(pr.id)
    chain.unshift({ type: pt, record: pr })
    t = pt
    r = pr
  }
  return chain
}

/** Types whose parent ref points at `typeKey`, with that field. */
export const childTypes = (typeKey: string, types: readonly RecordType[]) =>
  types.flatMap((t) => {
    const f = parentField(t)
    return f?.ref === typeKey ? [{ type: t, field: f }] : []
  })

export interface TreeNode {
  type: RecordType
  record: ErpRecord
  children: TreeNode[]
}

/** Children, grandchildren and further down to `depth`, following parent refs. */
export function descendants(type: RecordType, record: ErpRecord, types: readonly RecordType[], all: AllRecords, depth = 3): TreeNode[] {
  if (depth <= 0) return []
  return childTypes(type.key, types).flatMap(({ type: ct, field }) =>
    (all[ct.key] ?? [])
      .filter((r) => r.values[field.key] === record.id && r.id !== record.id)
      .map((r) => ({ type: ct, record: r, children: descendants(ct, r, types, all, depth - 1) })),
  )
}

/** Count and the summed main quantity of every record type in a tree, for the parent's roll-up tiles. */
export function rollup(nodes: readonly TreeNode[]) {
  const out = new Map<string, { type: RecordType; count: number; sum: number; field?: Field }>()
  const visit = (ns: readonly TreeNode[]) => {
    for (const n of ns) {
      const field = n.type.fields.find((f) => f.key === n.type.insight.sumField) ?? n.type.fields.find((f) => f.list && (f.type === 'number' || f.type === 'money'))
      const cur = out.get(n.type.key) ?? { type: n.type, count: 0, sum: 0, field }
      cur.count += 1
      cur.sum += field ? Number(n.record.values[field.key] ?? 0) || 0 : 0
      out.set(n.type.key, cur)
      visit(n.children)
    }
  }
  visit(nodes)
  return [...out.values()]
}
