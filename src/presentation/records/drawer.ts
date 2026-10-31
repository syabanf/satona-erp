import { createContext, useContext } from 'react'
import { typeOf } from '@/domain/catalog'
import type { Values } from '@/domain/records'

export type DrawerRequest = { mode: 'create'; type: string; prefill?: Values } | { mode: 'view' | 'edit'; type: string; id: string }

/** The full create page of a type that has one, with prefilled values as query parameters. */
export const createPageFor = (type: string, prefill: Values = {}) => {
  const page = typeOf(type)?.createPage
  const query = new URLSearchParams(Object.entries(prefill).map(([k, v]) => [k, String(v ?? '')])).toString()
  return page && (query ? `${page}?${query}` : page)
}

export const RecordDrawerContext = createContext<((request: DrawerRequest) => void) | null>(null)

/** Opens the record drawer to create, view or edit a record without leaving the page. */
export function useRecordDrawer() {
  const open = useContext(RecordDrawerContext)
  if (!open) throw new Error('useRecordDrawer needs RecordDrawerProvider')
  return open
}
