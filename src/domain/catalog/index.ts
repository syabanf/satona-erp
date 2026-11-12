import type { RecordType } from '../records'
import { adminTypes, GENERAL_MASTERS } from './admin'
import { DEVICE_TYPES } from './devices'
import { HOLDING, HOLDING_MASTERS, OCC_TYPES } from './holding'
import { CHEMICALS, CHEMICALS_MASTERS } from './chemicals'
import { CMMS_MASTERS, MES_TYPES, FERTILISER, FERTILISER_MASTERS } from './fertiliser'
import { FLEET_SAFETY, LOGISTICS, LOGISTICS_MASTERS } from './logistics'
import { SCOPE, SCOPE_MASTERS } from './scope'
import { SHE, SHE_MASTERS } from './she'
import { FINANCE, HRIS, HRIS_MASTERS, INVENTORY, PURCHASING, SERVICE_DESK } from './support'

/** Every record type, masters first within each entity. Seeding orders them by their refs. */
const BUSINESS: readonly RecordType[] = [...HOLDING_MASTERS, ...GENERAL_MASTERS, ...HOLDING, ...PURCHASING, ...HRIS_MASTERS, ...HRIS, ...FINANCE, ...INVENTORY, ...SERVICE_DESK, ...SHE_MASTERS, ...SHE, ...OCC_TYPES, ...LOGISTICS_MASTERS, ...LOGISTICS, ...FLEET_SAFETY, ...FERTILISER_MASTERS, ...CMMS_MASTERS, ...FERTILISER, ...MES_TYPES, ...CHEMICALS_MASTERS, ...CHEMICALS, ...SCOPE_MASTERS, ...SCOPE, ...DEVICE_TYPES]

/** Record types whose workflow has an approval gate; the approval matrix can govern these. */
export const APPROVABLE = BUSINESS.filter((t) => t.workflow.transitions.some((m) => m.needs === 'approve')).map((t) => t.key)

export const RECORD_TYPES: readonly RecordType[] = [...BUSINESS, ...adminTypes(APPROVABLE)]

export const typesOf = (module: string) => RECORD_TYPES.filter((t) => t.module === module)
export const typeOf = (key: string) => RECORD_TYPES.find((t) => t.key === key)
