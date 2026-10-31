import { describe, expect, it } from 'vitest'
import { seedRecords } from '@/infrastructure/mock/data/seeds'
import { byDay, dateFieldOf, monthGrid, shiftMonth } from './calendar'
import { typeOf } from './catalog'
import { cityIn, geoOf, mappable } from './geo'

const all = seedRecords('2026-10-31')

describe('geo', () => {
  it('reads cities out of names', () => {
    expect(cityIn('Cilegon → Cikampek')?.name).toBe('Cilegon')
    expect(cityIn('Depot Bandar Lampung')?.name).toBe('Bandar Lampung')
    expect(cityIn('nowhere')).toBeUndefined()
  })

  it('draws a trip as its lane and places kiosks through their distributor', () => {
    const trip = all['tms.trips']![0]!
    const geo = geoOf(typeOf('tms.trips')!, trip, all, typeOf)
    expect(geo?.line).toHaveLength(2)
    expect(geo?.place).toContain('→')
    expect(geoOf(typeOf('dms.kiosks')!, all['dms.kiosks']![0]!, all, typeOf)?.at).toBeDefined()
  })

  it('knows which features have a map', () => {
    expect(mappable(typeOf('tms.trips')!, all, typeOf)).toBe(true)
    expect(mappable(typeOf('sys.settings')!, all, typeOf)).toBe(false)
  })
})

describe('calendar', () => {
  it('lays a month out Monday first', () => {
    const grid = monthGrid('2026-10')
    expect(grid[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(grid.flat().filter(Boolean)).toHaveLength(31)
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('groups records by their date field', () => {
    const type = typeOf('tms.trips')!
    const field = dateFieldOf(type)!
    expect(field.key).toBe('departure')
    const days = byDay(all['tms.trips']!, field)
    expect([...days.values()].flat()).toHaveLength(all['tms.trips']!.length)
  })
})
