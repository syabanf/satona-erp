import { createContext, useContext } from 'react'
import type { Values } from '@/domain/records'

export type DrawerRequest = { mode: 'create'; type: string; prefill?: Values } | { mode: 'view' | 'edit'; type: string; id: string }

export const RecordDrawerContext = createContext<((request: DrawerRequest) => void) | null>(null)

/** Opens the record drawer to create, view or edit a record without leaving the page. */
export function useRecordDrawer() {
  const open = useContext(RecordDrawerContext)
  if (!open) throw new Error('useRecordDrawer needs RecordDrawerProvider')
  return open
}
