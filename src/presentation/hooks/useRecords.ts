import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { RECORD_TYPES } from '@/domain/catalog'
import { approvalInbox, overridesFrom } from '@/domain/approval'
import { effectiveAccess, type Access } from '@/domain/erp'
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
  const permissions = useRecordList('sys.permissions')
  const roles = useRecordList('sys.roles')
  const overrides = useMemo(() => overridesFrom(permissions.data ?? [], roles.data ?? []), [permissions.data, roles.data])
  return useCallback(
    (moduleId: string): Access => {
      const m = modules.data?.find((x) => x.id === moduleId)
      return m ? effectiveAccess(role, m, overrides) : 'none'
    },
    [modules.data, role, overrides],
  )
}

/** Everything the session role can approve right now. */
export function useApprovals() {
  const { clock } = useServices()
  const { role } = useSession()
  const all = useAllRecords()
  const accessFor = useAccess()
  return useMemo(() => (all.data ? approvalInbox(RECORD_TYPES, all.data, accessFor, role, clock.today()) : []), [all.data, accessFor, role, clock])
}
