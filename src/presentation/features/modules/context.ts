import { useOutletContext } from 'react-router'
import type { Access, ErpModule } from '@/domain/erp'

export interface ModuleContext {
  module: ErpModule
  access: Access
}

/** The module and the session's access to it, handed down by ModuleLayout. */
export const useModule = () => useOutletContext<ModuleContext>()
