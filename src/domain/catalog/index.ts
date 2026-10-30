import type { RecordType } from '../records'
import { adminTypes, GENERAL_MASTERS } from './admin'
import { HOLDING, HOLDING_MASTERS, OCC_TYPES } from './holding'
import { ROASI, ROASI_MASTERS } from './roasi'
import { CMMS_MASTERS, MES_TYPES, RODAME, RODAME_MASTERS } from './rodame'
import { FLEET_SAFETY, ROTAMA, ROTAMA_MASTERS } from './rotama'
import { SCOPE, SCOPE_MASTERS } from './scope'
import { SHE, SHE_MASTERS } from './she'
import { FINANCE, HRIS, HRIS_MASTERS, INVENTORY, PURCHASING, SERVICE_DESK } from './support'

/** Every record type, masters first within each entity. Seeding orders them by their refs. */
const BUSINESS: readonly RecordType[] = [...HOLDING_MASTERS, ...GENERAL_MASTERS, ...HOLDING, ...PURCHASING, ...HRIS_MASTERS, ...HRIS, ...FINANCE, ...INVENTORY, ...SERVICE_DESK, ...SHE_MASTERS, ...SHE, ...OCC_TYPES, ...ROTAMA_MASTERS, ...ROTAMA, ...FLEET_SAFETY, ...RODAME_MASTERS, ...CMMS_MASTERS, ...RODAME, ...MES_TYPES, ...ROASI_MASTERS, ...ROASI, ...SCOPE_MASTERS, ...SCOPE]

/** Record types whose workflow has an approval gate; the approval matrix can govern these. */
export const APPROVABLE = BUSINESS.filter((t) => t.workflow.transitions.some((m) => m.needs === 'approve')).map((t) => t.key)

export const RECORD_TYPES: readonly RecordType[] = [...BUSINESS, ...adminTypes(APPROVABLE)]

export const typesOf = (module: string) => RECORD_TYPES.filter((t) => t.module === module)
export const typeOf = (key: string) => RECORD_TYPES.find((t) => t.key === key)
