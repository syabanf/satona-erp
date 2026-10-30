import type { Clock, Ports } from '@/application/ports'
import { findById } from '@/domain/errors'
import { ENTITIES, MODULES, ROLES } from './data/erp'
import { createMockRecords } from './records'
import { ALERTS, DISTRIBUTORS, INTEGRATION, LOTS, REGIONS, SITES, TANKS, TRUCKS } from './data/ops'

/** Resolves after a short delay, standing in for network latency. */
const later = <T>(value: T, ms = 220) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
const find = <T extends { id: string }>(list: readonly T[], id: string, what: string) =>
  new Promise<T>((resolve, reject) => setTimeout(() => {
    try {
      resolve(findById(list, id, what))
    } catch (e) {
      reject(e)
    }
  }, 220))

export function createMockPorts(clock: Clock): Ports {
  return {
    clock,
    records: createMockRecords(clock),
    erp: {
      entities: () => later(ENTITIES),
      entity: (id) => find(ENTITIES, id, 'entity'),
      modules: () => later(MODULES),
      module: (id) => find(MODULES, id, 'module'),
      roles: () => later(ROLES),
      role: (id) => find(ROLES, id, 'role'),
    },
    ops: {
      sites: () => later(SITES),
      trucks: () => later(TRUCKS),
      tanks: () => later(TANKS),
      regions: () => later(REGIONS),
      distributors: () => later(DISTRIBUTORS),
      lots: () => later(LOTS),
      lot: (id) => find(LOTS, id, 'lot'),
      integration: () => later(INTEGRATION),
      alerts: () => later(ALERTS),
    },
  }
}
