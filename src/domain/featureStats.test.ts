import { describe, expect, it } from 'vitest'
import { RECORD_TYPES, typeOf } from './catalog'
import { featureStats, isFinal, relatedTypes } from './featureStats'
import type { ErpRecord } from './records'

const type = typeOf('vms.requisitions')!
const row = (id: string, status: string, value: number, createdAt: string): ErpRecord => ({ id, type: type.key, status, values: { value }, createdAt, updatedAt: createdAt, history: [] })

describe('feature stats', () => {
  const rows = [row('PR-1', 'draft', 100, '2026-10-20T08:00:00Z'), row('PR-2', 'submitted', 200, '2026-09-01T08:00:00Z'), row('PR-3', 'po', 300, '2026-10-29T08:00:00Z')]
  const stats = featureStats(type, rows, '2026-10-31')

  it('counts open, waiting and recent records and sums the main amount', () => {
    expect([stats.total, stats.open, stats.waiting, stats.recent]).toEqual([3, 2, 1, 2])
    expect(stats.sum?.value).toBe(600)
    expect(stats.byStatus.find((s) => s.id === 'po')?.count).toBe(1)
    expect(stats.latest.map((r) => r.id)).toEqual(['PR-3', 'PR-1', 'PR-2'])
  })

  it('treats a state without a next step as final', () => {
    expect(isFinal(type, 'po')).toBe(true)
    expect(isFinal(type, 'draft')).toBe(false)
  })

  it('finds the masters a feature uses and the features that use it', () => {
    const trips = relatedTypes(typeOf('tms.trips')!, RECORD_TYPES)
    expect(trips.uses.map((t) => t.key)).toEqual(expect.arrayContaining(['tms.drivers', 'tms.vehicles', 'mdm.materials']))
    expect(trips.usedBy.map((t) => t.key)).toEqual(expect.arrayContaining(['haz.manifests', 'fbl.invoices', 'tms.telemetry']))
  })
})
