import { useMemo } from 'react'
import { tankStatus, type Alert } from '@/domain/ops'
import { useAllRecords } from './useRecords'
import { useResource } from './useResource'
import { useServices } from './useServices'

/** Telemetry alerts from the ops feed, plus alerts the records raise: tanks under reorder, lots on hold. */
export function useAlerts(): readonly Alert[] {
  const { ops } = useServices()
  const feed = useResource('ops.alerts', () => ops.alerts())
  const all = useAllRecords()
  return useMemo(() => {
    const tanks = (all.data?.['tfm.tanks'] ?? [])
      .filter((r) => r.status === 'online' && tankStatus({ level: Number(r.values.level), reorderAt: Number(r.values.reorderAt) }) === 'reorder')
      .map<Alert>((r) => ({
        id: `tank-${r.id}`,
        tone: 'danger',
        title: `${r.values.tank} under reorder point`,
        detail: `${r.values.product} at ${r.values.level}%, reorder at ${r.values.reorderAt}%`,
        to: `/tank-farm?tank=${String(r.values.tank).toLowerCase()}`,
      }))
    const holds = (all.data?.['gtr.lots'] ?? [])
      .filter((r) => r.status === 'hold')
      .map<Alert>((r) => ({ id: `lot-${r.id}`, tone: 'info', title: `Lot ${r.values.lotNo} on hold`, detail: `${r.values.product} waits for QA release`, to: `/traceability/${r.values.lotNo}` }))
    return [...tanks, ...(feed.data ?? []), ...holds]
  }, [feed.data, all.data])
}
