import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { RECORD_TYPES } from '@/domain/catalog'
import { buildMenu, trail } from '@/domain/menu'
import { useAccess, useApprovals } from './useRecords'
import { useResource } from './useResource'
import { useServices } from './useServices'

/** The menu for the session role, with approval counts keyed by `type:status`. */
export function useMenu() {
  const { erp } = useServices()
  const modules = useResource('erp.modules', () => erp.modules())
  const accessFor = useAccess()
  const approvals = useApprovals()
  const tree = useMemo(
    () => (modules.data ? buildMenu({ modules: modules.data, types: RECORD_TYPES, accessFor }) : []),
    [modules.data, accessFor],
  )
  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of approvals) out[`${a.type.key}:${a.record.status}`] = (out[`${a.type.key}:${a.record.status}`] ?? 0) + 1
    return out
  }, [approvals])
  return { tree, counts, approvals: approvals.length }
}

/** The folders and leaf for the current location. */
export function useTrail() {
  const { tree } = useMenu()
  const { pathname, search } = useLocation()
  return useMemo(() => trail(tree, pathname, search), [tree, pathname, search])
}
