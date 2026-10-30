import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { RECORD_TYPES } from '@/domain/catalog'
import { accessOf, type Access } from '@/domain/erp'
import { awaitingApproval } from '@/domain/records'
import { useResource } from './useResource'
import { useServices } from './useServices'
import { useSession } from './useSession'

/** Bumps whenever any record changes, so keys that include it refetch without a skeleton. */
export function useRecordsVersion() {
  const { records } = useServices()
  return useSyncExternalStore(records.subscribe, records.version)
}

export function useRecordList(typeKey: string) {
  const { records } = useServices()
  const version = useRecordsVersion()
  return useResource(`records:${typeKey}:${version}`, () => records.list(typeKey))
}

export function useAllRecords() {
  const { records } = useServices()
  const version = useRecordsVersion()
  return useResource(`records:all:${version}`, () => records.all())
}

/** The session role's access per module id; `none` until the module list loads. */
export function useAccess() {
  const { erp } = useServices()
  const { role } = useSession()
  const modules = useResource('erp.modules', () => erp.modules())
  return useCallback(
    (moduleId: string): Access => {
      const m = modules.data?.find((x) => x.id === moduleId)
      return m ? accessOf(role, m) : 'none'
    },
    [modules.data, role],
  )
}

/** Everything the session role can approve right now. */
export function useApprovals() {
  const all = useAllRecords()
  const accessFor = useAccess()
  return useMemo(() => (all.data ? awaitingApproval(RECORD_TYPES, all.data, accessFor) : []), [all.data, accessFor])
}
