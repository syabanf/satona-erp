import { useMemo } from 'react'
import { employeeOf } from '@/domain/selfService'
import { useAllRecords } from './useRecords'
import { useSession } from './useSession'

/** Every record plus the employee the signed-in role stands for; both undefined while the data loads. */
export function useMe() {
  const { role } = useSession()
  const all = useAllRecords().data
  const me = useMemo(() => (all ? employeeOf(role, all['mdm.employees'] ?? []) : undefined), [all, role])
  return { all, me }
}
