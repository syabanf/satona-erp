import { useCallback, useEffect, useMemo, useRef } from 'react'
import { RECORD_TYPES } from '@/domain/catalog'
import { duePlans, lowStock, staleApprovals } from '@/domain/automation'
import { useAllRecords } from './useRecords'
import { useServices } from './useServices'
import { useSession } from './useSession'
import { useStored } from './useStored'

export type Rule = 'pm' | 'stock' | 'remind'
const KEY = 'wit-automation'
const RAN = 'wit-automation-ran'

/**
 * The three automation rules for the session role: what each would do now, a runner that creates the work orders,
 * requisitions and reminders, and per-rule switches that run once per session when the dashboard opens.
 */
export function useAutomation() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const today = clock.today()
  const [auto, setAuto] = useStored<Record<Rule, boolean>>(KEY, { pm: false, stock: false, remind: false })
  const pending = useMemo(() => {
    if (!all.data) return null
    return { pm: duePlans(all.data, today), stock: lowStock(all.data, today), remind: staleApprovals(RECORD_TYPES, all.data, today) }
  }, [all.data, today])

  const run = useCallback(
    async (rule: Rule) => {
      if (!pending) return { done: 0, failed: 0 }
      let done = 0
      let failed = 0
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          await fn()
          done += 1
        } catch {
          failed += 1
        }
      }
      if (rule === 'pm')
        for (const p of pending.pm)
          await attempt(async () => {
            const wo = await records.create(role, 'eam.workorders', p.order)
            await records.update(role, 'eam.plans', p.plan.id, p.update)
            await records.note(role, 'eam.plans', p.plan.id, `Work order ${wo.id} dibuat otomatis`)
          })
      if (rule === 'stock') for (const s of pending.stock) await attempt(() => records.create(role, 'vms.requisitions', s.requisition))
      if (rule === 'remind') for (const s of pending.remind.slice(0, 20)) await attempt(() => records.note(role, s.type.key, s.record.id, `Pengingat persetujuan: menunggu ${s.days} hari`))
      return { done, failed }
    },
    [pending, records, role],
  )

  const toggle = (rule: Rule, on: boolean) => setAuto({ ...auto, [rule]: on })
  return { pending, run, auto, toggle }
}

/** Runs the switched-on rules once per browser session, as soon as the records have loaded. */
export function useAutomationRunner() {
  const { pending, run, auto } = useAutomation()
  const started = useRef(false)
  useEffect(() => {
    if (!pending || started.current) return
    started.current = true
    try {
      if (sessionStorage.getItem(RAN)) return
      sessionStorage.setItem(RAN, '1')
    } catch {
      return
    }
    for (const rule of ['pm', 'stock', 'remind'] as const) if (auto[rule]) void run(rule)
  }, [pending, run, auto])
}
