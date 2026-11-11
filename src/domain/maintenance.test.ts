import { describe, expect, it } from 'vitest'
import { assetValue, conditionOf, issueParts, meterDue, predict } from './maintenance'

describe('maintenance rules', () => {
  it('warns from 80% of the limit and alarms at it', () => {
    expect(conditionOf(5, 10)).toBe('Normal')
    expect(conditionOf(8, 10)).toBe('Warning')
    expect(conditionOf(10, 10)).toBe('Alarm')
  })

  it('projects a rising trend to the day it crosses the limit', () => {
    const readings = [
      { date: '2026-11-01', value: 4 },
      { date: '2026-11-05', value: 5 },
      { date: '2026-11-09', value: 6 },
    ]
    const p = predict(readings, 7.1, '2026-11-09')
    expect(p.slope).toBeCloseTo(0.25)
    expect(p.daysToLimit).toBe(4)
    expect(predict(readings.map((r) => ({ ...r, value: 3 })), 7.1, '2026-11-09').daysToLimit).toBeUndefined()
  })

  it('depreciates in a straight line and caps utilisation at 100%', () => {
    const v = assetValue(100_000_000, '2021-11-09', 10, 20_000, '2026-11-09')
    expect(v.book).toBeCloseTo(50_000_000, -5)
    expect(v.utilisation).toBeLessThan(1)
    expect(assetValue(10, '2000-01-01', 5, 0, '2026-01-01').book).toBe(0)
  })

  it('makes meter PM due once the meter passes the next service reading', () => {
    expect(meterDue(1000, 500, 1400)).toEqual({ nextAt: 1500, remaining: 100, due: false })
    expect(meterDue(1000, 500, 1600).due).toBe(true)
  })

  it('takes issued parts from stock and refuses to go below zero', () => {
    expect(issueParts(5, 2)).toEqual({ blocker: undefined, onHand: 3 })
    expect(issueParts(1, 2).blocker).toMatch(/Only 1 in stock/)
  })
})
