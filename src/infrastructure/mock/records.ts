import type { Clock, RecordEvent, RecordsPort } from '@/application/ports'
import { typeOf } from '@/domain/catalog'
import { NotFoundError } from '@/domain/errors'
import { seedRecords } from './data/seeds'

const later = <T>(value: T, ms = 180) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** In-memory store seeded on start. Reloading the page, or `reset()`, brings the seed back. */
export function createMockRecords(clock: Clock): RecordsPort {
  let store = seedRecords(clock.today())
  let events: RecordEvent[] = []
  let version = 0
  const listeners = new Set<() => void>()

  function publish(type: string, recordId: string, action: string, by: string) {
    const t = typeOf(type)
    events = [{ id: `ev-${Date.now()}-${events.length}`, at: new Date().toISOString(), topic: `${t?.module ?? 'erp'}.${type.split('.')[1] ?? type}`, action, recordId, by }, ...events].slice(0, 200)
    version += 1
    for (const fn of listeners) fn()
  }

  return {
    all: () => later(store),
    list: (type) => later(store[type] ?? []),
    get: (type, id) => {
      const found = store[type]?.find((r) => r.id === id)
      return found ? later(found) : Promise.reject(new NotFoundError(typeOf(type)?.singular.toLowerCase() ?? 'record', id))
    },
    save: (record, { action, by }) => {
      const rows = store[record.type] ?? []
      const exists = rows.some((r) => r.id === record.id)
      store = { ...store, [record.type]: exists ? rows.map((r) => (r.id === record.id ? record : r)) : [record, ...rows] }
      publish(record.type, record.id, action, by)
      return later(record)
    },
    remove: (type, id, by) => {
      store = { ...store, [type]: (store[type] ?? []).filter((r) => r.id !== id) }
      publish(type, id, 'Deleted', by)
      return later(undefined)
    },
    reset: () => {
      store = seedRecords(clock.today())
      events = []
      version += 1
      for (const fn of listeners) fn()
      return later(undefined)
    },
    events: () => later(events, 60),
    version: () => version,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
