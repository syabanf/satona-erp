import { useCallback } from 'react'
import { approvalMoves, matrixOf, moveBlocker } from '@/domain/approval'
import { allowedTransitions, stateOf, type ErpRecord, type RecordType, type Values } from '@/domain/records'
import { useAccess, useAllRecords } from '../hooks/useRecords'
import { useServices } from '../hooks/useServices'
import { useSession } from '../hooks/useSession'
import { useToast } from '../ui/useToast'

/** Record writes for the session role with a toast for every outcome, plus the moves the role may take on a record. */
export function useRecordActions() {
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const accessFor = useAccess()
  const all = useAllRecords()

  const run = useCallback(
    async <T,>(work: () => Promise<T>, done: (result: T) => string, failed: string): Promise<T | undefined> => {
      try {
        const result = await work()
        toast({ title: done(result) })
        return result
      } catch (e) {
        toast({ tone: 'danger', title: failed, description: e instanceof Error ? e.message : String(e) })
        return undefined
      }
    },
    [toast],
  )

  /** Workflow moves this role may take now: plain moves by module access, approve moves by the approval matrix, minus safety blockers. */
  const controls = useCallback(
    (type: RecordType, record: ErpRecord) => {
      const access = accessFor(type.module)
      const approval = approvalMoves(type, record, access, role, matrixOf(all.data ?? {}), clock.today())
      const allowed = [...allowedTransitions(type, record.status, access).filter((t) => t.needs !== 'approve'), ...approval.moves]
      return {
        access,
        approval,
        blocker: allowed.map((m) => moveBlocker(type, record, m.to)).find(Boolean),
        moves: allowed.filter((m) => !moveBlocker(type, record, m.to)),
      }
    },
    [accessFor, role, all.data, clock],
  )

  return {
    controls,
    // Saves throw on failure so RecordForm can mark the invalid fields and keep the input.
    create: async (type: RecordType, values: Values) => {
      const saved = await records.create(role, type.key, values)
      toast({ title: `${saved.id} created` })
      return saved
    },
    update: async (type: RecordType, id: string, values: Values) => {
      const saved = await records.update(role, type.key, id, values)
      toast({ title: `${saved.id} saved` })
      return saved
    },
    remove: (type: RecordType, id: string) => run(() => records.remove(role, type.key, id).then(() => id), () => `${id} deleted`, 'Not deleted'),
    step: (type: RecordType, record: ErpRecord, to: string) =>
      run(
        () => records.transition(role, type.key, record.id, to),
        (r) => (r.status === to ? `${r.id} moved to ${stateOf(type, to)?.label ?? to}` : `${r.id} signed at level ${r.approvals?.length ?? 1}`),
        'Not changed',
      ),
  }
}
