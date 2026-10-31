import type { Clock, RecordEvent, RecordsPort } from '@/application/ports'
import type { ErpRecord } from '@/domain/records'
import { typeOf } from '@/domain/catalog'
import { NotFoundError } from '@/domain/errors'
import { seedRecords } from './data/seeds'

const later = <T>(value: T, ms = 180) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

type Store = ReturnType<typeof seedRecords>
type SyncMessage =
  | { kind: 'save'; record: ErpRecord }
  | { kind: 'remove'; type: string; id: string }
  | { kind: 'reset' }
  | { kind: 'hello' }
  | { kind: 'snapshot'; store: Store }

/**
 * Every window of the OS view loads its own copy of the app, so the copies share changes over a BroadcastChannel:
 * each save, delete and reset goes out as a message, and a newly opened window asks for the current data.
 * Only in a browser, so tests keep their stores apart.
 */
function channel(onMessage: (m: SyncMessage) => void) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined
  const c = new BroadcastChannel('satona-records')
  c.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data)
  return (m: SyncMessage) => c.postMessage(m)
}

/** In-memory store seeded on start. Reloading the page, or `reset()`, brings the seed back. */
export function createMockRecords(clock: Clock): RecordsPort {
  let store = seedRecords(clock.today())
  let events: RecordEvent[] = []
  let version = 0
  const listeners = new Set<() => void>()
  let changed = false
  const notify = () => {
    version += 1
    for (const fn of listeners) fn()
  }
  const put = (record: ErpRecord) => {
    const rows = store[record.type] ?? []
    store = { ...store, [record.type]: rows.some((r) => r.id === record.id) ? rows.map((r) => (r.id === record.id ? record : r)) : [record, ...rows] }
  }
  const send = channel((m) => {
    if (m.kind === 'hello') return changed && send?.({ kind: 'snapshot', store })
    if (m.kind === 'snapshot') store = m.store
    else if (m.kind === 'save') put(m.record)
    else if (m.kind === 'remove') store = { ...store, [m.type]: (store[m.type] ?? []).filter((r) => r.id !== m.id) }
    else store = seedRecords(clock.today())
    changed = m.kind !== 'reset'
    notify()
  })
  send?.({ kind: 'hello' })

  function publish(type: string, recordId: string, action: string, by: string) {
    const t = typeOf(type)
    events = [{ id: `ev-${Date.now()}-${events.length}`, at: new Date().toISOString(), topic: `${t?.module ?? 'erp'}.${type.split('.')[1] ?? type}`, action, recordId, by }, ...events].slice(0, 200)
    changed = true
    notify()
  }

  return {
    all: () => later(store),
    list: (type) => later(store[type] ?? []),
    get: (type, id) => {
      const found = store[type]?.find((r) => r.id === id)
      return found ? later(found) : Promise.reject(new NotFoundError(typeOf(type)?.singular.toLowerCase() ?? 'record', id))
    },
    save: (record, { action, by }) => {
      put(record)
      publish(record.type, record.id, action, by)
      send?.({ kind: 'save', record })
      return later(record)
    },
    remove: (type, id, by) => {
      store = { ...store, [type]: (store[type] ?? []).filter((r) => r.id !== id) }
      publish(type, id, 'Deleted', by)
      send?.({ kind: 'remove', type, id })
      return later(undefined)
    },
    reset: () => {
      store = seedRecords(clock.today())
      events = []
      changed = false
      notify()
      send?.({ kind: 'reset' })
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
