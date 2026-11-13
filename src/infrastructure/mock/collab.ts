import type { Clock, CollabPort, Note } from '@/application/ports'

const later = <T>(value: T, ms = 120) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** In-memory comments and attachments, seeded with a short thread so record pages show the feature. Files live as data URLs. */
export function createMockCollab(clock: Clock): CollabPort {
  const at = (daysAgo: number, hour: number) => `${new Date(Date.parse(`${clock.today()}T00:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10)}T0${hour}:15:00.000Z`
  let notes: Note[] = [
    { id: 'n1', target: 'eam.workorders:WO-0001', kind: 'comment', by: 'Machine Technician / Mechanic', at: at(2, 2), text: 'Bearing sisi drive sudah aus, saya ganti hari ini. @Spare Parts Admin tolong siapkan 2 unit SKF 22320.' },
    { id: 'n2', target: 'eam.workorders:WO-0001', kind: 'comment', by: 'Spare Parts Admin', at: at(1, 4), text: 'Sudah dikeluarkan dari gudang, cek reservasi di Part issues.' },
    { id: 'n3', target: 'fbl.quotations:QTN-0001', kind: 'comment', by: 'Group IT Program Lead', at: at(1, 6), text: '@CFO / Finance Director mohon cek diskon untuk pelanggan ini sebelum dikirim.' },
  ]
  let version = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    version += 1
    for (const fn of listeners) fn()
  }
  return {
    list: (target) => later(notes.filter((n) => n.target === target).sort((a, b) => a.at.localeCompare(b.at))),
    async add(note) {
      const saved: Note = { ...note, id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() }
      notes = [...notes, saved]
      notify()
      return later(saved)
    },
    async remove(id) {
      notes = notes.filter((n) => n.id !== id)
      notify()
      return later(undefined)
    },
    version: () => version,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
