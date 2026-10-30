import { describe, expect, it } from 'vitest'
import { pointAlong, tankStatus, traceFrom } from './ops'

describe('ops rules', () => {
  it('walks a polyline by length', () => {
    const route = [[0, 0], [0, 10], [10, 10]] as const
    expect(pointAlong(route, 0)).toEqual([0, 0])
    expect(pointAlong(route, 0.25)).toEqual([0, 5])
    expect(pointAlong(route, 0.75)).toEqual([5, 10])
    expect(pointAlong(route, 1)).toEqual([10, 10])
  })

  it('flags tanks at or under the reorder point and near full', () => {
    expect(tankStatus({ level: 30, reorderAt: 30 })).toBe('reorder')
    expect(tankStatus({ level: 60, reorderAt: 30 })).toBe('ok')
    expect(tankStatus({ level: 95, reorderAt: 30 })).toBe('high')
  })

  it('traces downstream from a vendor lot without pulling in sibling vendors', () => {
    const lot = { links: [['v0', 'tank'], ['v1', 'tank'], ['tank', 'r'], ['r', 't0'], ['t0', 'c0']] as const }
    expect([...traceFrom(lot, 'v0')].sort()).toEqual(['c0', 'r', 't0', 'tank', 'v0'])
    expect([...traceFrom(lot, 'c0')].sort()).toEqual(['c0', 'r', 't0', 'tank', 'v0', 'v1'])
  })
})
