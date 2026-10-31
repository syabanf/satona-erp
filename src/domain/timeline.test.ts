import { describe, expect, it } from 'vitest'
import { typeOf } from './catalog'
import type { ErpRecord } from './records'
import { daysBetween, spanOf, spanRule } from './timeline'

const rec = (values: ErpRecord['values'], createdAt = '2026-10-01T08:00:00Z', updatedAt = '2026-10-09T08:00:00Z'): ErpRecord => ({ id: 'X-1', type: 't', status: 's', values, createdAt, updatedAt, history: [] })

describe('timeline spans', () => {
  it('uses two dates as a range, swapping them when they run backwards', () => {
    const span = spanOf(typeOf('hrs.contracts')!)
    expect(span(rec({ start: '2026-01-01', end: '2026-12-31' }))).toEqual({ start: '2026-01-01', end: '2026-12-31', kind: 'range' })
    expect(span(rec({ start: '2026-12-31', end: '2026-01-01' }))?.start).toBe('2026-01-01')
  })

  it('adds a duration in hours or days to a single date', () => {
    expect(spanOf(typeOf('mrp.schedule')!)(rec({ start: '2026-10-10', hours: 36 }))?.end).toBe('2026-10-11')
    expect(spanOf(typeOf('hrs.leaves')!)(rec({ from: '2026-10-10', days: 3 }))).toMatchObject({ kind: 'duration' })
  })

  it('makes a single date a milestone and falls back to the record lifetime', () => {
    expect(spanRule(typeOf('tms.trips')!).kind).toBe('milestone')
    expect(spanOf(typeOf('sys.settings')!)(rec({}))).toEqual({ start: '2026-10-01', end: '2026-10-09', kind: 'lifetime' })
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8)
  })
})
