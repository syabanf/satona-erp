/** Numbers and links behind a feature's folder page: one record type, its records and the features around it. */
import type { ErpRecord, Field, RecordType, StateTone } from './records'

export interface FeatureStats {
  total: number
  /** Records in a state that still has a next step. */
  open: number
  /** Records waiting at an approval gate. */
  waiting: number
  /** Records created in the last `recentDays` days. */
  recent: number
  sum?: { field: Field; value: number }
  byStatus: ReadonlyArray<{ id: string; label: string; tone: StateTone; count: number }>
  /** Newest first. */
  latest: readonly ErpRecord[]
}

export const isFinal = (type: RecordType, status: string) => !type.workflow.transitions.some((t) => t.from === status)

/** The states where a record waits for an approver. */
export const approvalStates = (type: RecordType) => new Set(type.workflow.transitions.filter((t) => t.needs === 'approve').map((t) => t.from))

export function featureStats(type: RecordType, rows: readonly ErpRecord[], today: string, recentDays = 30): FeatureStats {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - recentDays * 86_400_000).toISOString()
  const gates = approvalStates(type)
  const sumField = type.fields.find((f) => f.key === type.insight.sumField)
  return {
    total: rows.length,
    open: rows.filter((r) => !isFinal(type, r.status)).length,
    waiting: rows.filter((r) => gates.has(r.status)).length,
    recent: rows.filter((r) => r.createdAt >= since).length,
    sum: sumField && { field: sumField, value: rows.reduce((s, r) => s + (Number(r.values[sumField.key]) || 0), 0) },
    byStatus: type.workflow.states.map((s) => ({ id: s.id, label: s.label, tone: s.tone, count: rows.filter((r) => r.status === s.id).length })),
    latest: [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
  }
}

/** The masters a feature picks from, and the features that point back at it. */
export function relatedTypes(type: RecordType, types: readonly RecordType[]) {
  const targets = new Set(type.fields.filter((f) => f.type === 'ref' && f.ref !== type.key).map((f) => f.ref!))
  return {
    uses: types.filter((t) => targets.has(t.key)),
    usedBy: types.filter((t) => t.key !== type.key && t.fields.some((f) => f.type === 'ref' && f.ref === type.key)),
  }
}
