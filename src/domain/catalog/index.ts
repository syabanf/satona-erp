import type { RecordType } from '../records'
import { HOLDING, HOLDING_MASTERS, OCC_TYPES } from './holding'
import { ROASI, ROASI_MASTERS } from './roasi'
import { CMMS_MASTERS, MES_TYPES, RODAME, RODAME_MASTERS } from './rodame'
import { FLEET_SAFETY, ROTAMA, ROTAMA_MASTERS } from './rotama'

/** Every record type, masters first within each entity. Seeding orders them by their refs. */
export const RECORD_TYPES: readonly RecordType[] = [...HOLDING_MASTERS, ...HOLDING, ...OCC_TYPES, ...ROTAMA_MASTERS, ...ROTAMA, ...FLEET_SAFETY, ...RODAME_MASTERS, ...CMMS_MASTERS, ...RODAME, ...MES_TYPES, ...ROASI_MASTERS, ...ROASI]

export const typesOf = (module: string) => RECORD_TYPES.filter((t) => t.module === module)
export const typeOf = (key: string) => RECORD_TYPES.find((t) => t.key === key)
