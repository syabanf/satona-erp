/** Rules that create work from the data: PM plans come due, spare parts run low, approvals wait too long. */
import { meterDue } from './maintenance'
import type { ErpRecord, RecordType, Values } from './records'

type All = Readonly<Record<string, readonly ErpRecord[]>>

const DONE = new Set(['completed', 'verified', 'closed', 'cancelled', 'rejected'])
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const daysSince = (iso: string, today: string) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(iso)) / 86_400_000)

/**
 * Maintenance plans due by calendar or by meter that have no open preventive work order on their asset yet,
 * each with the work order to create and the plan update that moves it to its next cycle.
 */
export function duePlans(all: All, today: string) {
  const hours = new Map((all['eam.assets'] ?? []).map((a) => [a.id, Number(a.values.runHours) || 0]))
  const open = (all['eam.workorders'] ?? []).filter((w) => !DONE.has(w.status) && w.values.kind === 'Preventive')
  // Technicians take turns, so a batch of PM orders spreads over the team.
  const techs = (all['eam.technicians'] ?? []).filter((t) => t.status === 'active' || !t.status)
  let turn = 0
  return (all['eam.plans'] ?? []).flatMap((plan) => {
    if (plan.status !== 'active') return []
    const asset = String(plan.values.asset)
    const meter = plan.values.strategy === 'Meter based' && plan.values.meterInterval
    const m = meter ? meterDue(Number(plan.values.lastDoneAt) || 0, Number(plan.values.meterInterval), hours.get(asset) ?? 0) : undefined
    const due = m ? m.due : Boolean(plan.values.nextDue) && String(plan.values.nextDue) <= today
    if (!due || open.some((w) => w.values.asset === asset && w.values.task === plan.values.task)) return []
    const order: Values = { task: plan.values.task, asset, kind: 'Preventive', priority: 'P3', technician: techs[turn++ % Math.max(1, techs.length)]?.id ?? '', due: today }
    const update: Values = m ? { ...plan.values, lastDoneAt: hours.get(asset) ?? 0 } : { ...plan.values, nextDue: plusDays(today, Number(plan.values.interval) || 30) }
    return [{ plan, reason: m ? `${Math.round(-m.remaining)} jam lewat batas meter` : `jatuh tempo ${String(plan.values.nextDue)}`, order, update }]
  })
}

/** Spare parts at or below their minimum with no open purchase requisition naming their part number. */
export function lowStock(all: All, today: string) {
  const material = (all['mdm.materials'] ?? []).find((m) => m.values.code === 'MRO-SPARE')?.id
  const openPr = (all['vms.requisitions'] ?? []).filter((r) => !DONE.has(r.status))
  return (all['eam.parts'] ?? []).flatMap((part) => {
    const onHand = Number(part.values.onHand) || 0
    const min = Number(part.values.minStock) || 0
    if (onHand > min || !material || openPr.some((r) => String(r.values.title).includes(String(part.values.partNo)))) return []
    const qty = Math.max(1, min * 2 - onHand)
    const requisition: Values = { title: `Restock ${String(part.values.partNo)} ${String(part.values.name)}`, material, qty, entity: 'fertiliser', value: qty * (Number(part.values.unitCost) || 0), needBy: plusDays(today, 14) }
    return [{ part, qty, requisition }]
  })
}

/** Records waiting at an approval step for `days` or more since their last change, oldest first. */
export function staleApprovals(types: readonly RecordType[], all: All, today: string, days = 3) {
  return types
    .flatMap((type) => {
      const waiting = new Set(type.workflow.transitions.filter((t) => t.needs === 'approve').map((t) => t.from))
      return (all[type.key] ?? []).filter((r) => waiting.has(r.status) && daysSince(r.updatedAt, today) >= days).map((record) => ({ type, record, days: daysSince(record.updatedAt, today) }))
    })
    .sort((a, b) => b.days - a.days)
}
