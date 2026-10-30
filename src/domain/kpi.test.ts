import { describe, expect, it } from 'vitest'
import { backlog, byHour, oeeBy, oeeSummary, pareto, perDay, perMonth, pmCompliance, reliability, safetyScores, workMix } from './kpi'
import type { ErpRecord } from './records'

const r = (values: ErpRecord['values'], status = 'completed'): ErpRecord => ({ id: String(Math.random()), type: 't', status, values, createdAt: '2026-10-01T00:00:00Z', updatedAt: '', history: [] })

describe('plant KPIs', () => {
  it('multiplies the averaged OEE factors and groups by work centre', () => {
    const rows = [r({ workcenter: 'A', availability: 90, performance: 80, quality: 100 }), r({ workcenter: 'B', availability: 70, performance: 80, quality: 100 })]
    expect(oeeSummary(rows).oee).toBeCloseTo(64)
    expect(oeeBy(rows, 'workcenter').map((g) => Math.round(g.oee))).toEqual([72, 56])
  })

  it('orders a Pareto with running shares', () => {
    const p = pareto([{ key: 'a', value: 1 }, { key: 'b', value: 3 }, { key: 'a', value: 1 }])
    expect(p.map((x) => x.key)).toEqual(['b', 'a'])
    expect(p.at(-1)?.cumulative).toBe(1)
    expect(p[0]?.share).toBeCloseTo(0.6)
  })

  it('computes MTBF, MTTR and downtime from finished breakdowns', () => {
    const orders = [
      r({ kind: 'Corrective', due: '2026-10-20', labourHours: 4, downtimeHours: 6 }),
      r({ kind: 'Emergency', due: '2026-10-10', labourHours: 2, downtimeHours: 2 }),
      r({ kind: 'Corrective', due: '2026-10-11', labourHours: 9 }, 'progress'),
      r({ kind: 'Preventive', due: '2026-10-11', labourHours: 1 }),
    ]
    expect(reliability(orders, 2, '2026-10-30', 30, 20)).toEqual({ failures: 2, mtbf: 600, mttr: 3, downtime: 8 })
  })

  it('reports PM compliance, backlog weeks and work mix', () => {
    const orders = [r({ kind: 'Preventive', due: '2026-10-20' }), r({ kind: 'Preventive', due: '2026-10-21' }, 'open'), r({ kind: 'Corrective', due: '2026-10-21', labourHours: 21 }, 'waiting')]
    expect(pmCompliance(orders, '2026-10-30').rate).toBe(0.5)
    expect(backlog(orders, 1, 0.55)).toMatchObject({ open: 2, hours: 22, weeks: 1 })
    expect(workMix(orders)).toEqual({ planned: 1, unplanned: 0, plannedShare: 1 })
  })
})

describe('fleet safety', () => {
  it('scores drivers by weighted events and ignores false alarms', () => {
    const rows = [r({ driver: 'A', severity: 'Critical', hour: 2 }, 'new'), r({ driver: 'A', severity: 'Low', hour: 2 }, 'new'), r({ driver: 'B', severity: 'High', hour: 9 }, 'false')]
    expect(safetyScores(rows)).toEqual([{ driver: 'A', events: 2, points: 11, score: 78 }])
    expect(byHour(rows)[2]).toBe(2)
  })
})

describe('time buckets', () => {
  const rows = [r({ d: '2026-10-05' }), r({ d: '2026-10-30' }), r({ d: '2026-09-01' })]
  it('counts per month and per day ending today', () => {
    expect(perMonth(rows, '2026-10-30', 2, (x) => String(x.values.d))).toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }])
    expect(perDay(rows, '2026-10-30', 2, (x) => String(x.values.d))).toEqual([{ day: '2026-10-29', count: 0 }, { day: '2026-10-30', count: 1 }])
  })
})
