/**
 * Ports: what the application needs from the outside world.
 * Infrastructure implements them (the mock seed today); presentation never imports them directly.
 */
import type { Entity, EntityId, ErpModule, Role } from '@/domain/erp'
import type { ErpRecord } from '@/domain/records'
import type { Alert, Distributor, IntegrationComponent, Lot, Region, Site, Tank, Truck } from '@/domain/ops'
import type { IsoDate } from '@/lib/dates'

export interface Clock {
  today(): IsoDate
}

export interface ErpPort {
  entities(): Promise<readonly Entity[]>
  entity(id: EntityId): Promise<Entity>
  modules(): Promise<readonly ErpModule[]>
  module(id: string): Promise<ErpModule>
  roles(): Promise<readonly Role[]>
  role(id: string): Promise<Role>
}

export interface OpsPort {
  sites(): Promise<readonly Site[]>
  trucks(): Promise<readonly Truck[]>
  tanks(): Promise<readonly Tank[]>
  regions(): Promise<readonly Region[]>
  distributors(): Promise<readonly Distributor[]>
  lots(): Promise<readonly Lot[]>
  lot(id: string): Promise<Lot>
  integration(): Promise<readonly IntegrationComponent[]>
  alerts(): Promise<readonly Alert[]>
}

/** One change on the event bus: what the Integration page shows as the Kafka feed. */
export interface RecordEvent {
  id: string
  at: string
  topic: string
  action: string
  recordId: string
  by: string
}

/** Raw record storage. Rules (access, validation, workflow) live in the services, not here. */
export interface RecordsPort {
  all(): Promise<Readonly<Record<string, readonly ErpRecord[]>>>
  list(type: string): Promise<readonly ErpRecord[]>
  get(type: string, id: string): Promise<ErpRecord>
  /** Inserts or replaces by id and publishes the event. */
  save(record: ErpRecord, event: Pick<RecordEvent, 'action' | 'by'>): Promise<ErpRecord>
  remove(type: string, id: string, by: string): Promise<void>
  reset(): Promise<void>
  events(): Promise<readonly RecordEvent[]>
  /** Bumps on every change, so screens can refetch. */
  version(): number
  subscribe(onChange: () => void): () => void
}

export interface Ports {
  clock: Clock
  erp: ErpPort
  ops: OpsPort
  records: RecordsPort
}
