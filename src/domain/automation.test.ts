import { describe, expect, it } from 'vitest'
import { duePlans, lowStock, staleApprovals } from './automation'
import { RECORD_TYPES } from './catalog'
import type { ErpRecord } from './records'

const rec = (id: string, type: string, status: string, values: ErpRecord['values'], updatedAt = '2026-11-01T00:00:00Z'): ErpRecord => ({ id, type, status, values, createdAt: updatedAt, updatedAt, history: [] })
const today = '2026-11-13'

describe('automation rules', () => {
  it('raises a PM work order once a plan is due by date or meter, and not twice', () => {
    const all = {
      'eam.assets': [rec('AST-1', 'eam.assets', 'running', { runHours: 1600 })],
      'eam.plans': [
        rec('MP-1', 'eam.plans', 'active', { task: 'Lube', asset: 'AST-1', strategy: 'Time based', interval: 30, nextDue: '2026-11-10' }),
        rec('MP-2', 'eam.plans', 'active', { task: 'Bearing', asset: 'AST-1', strategy: 'Meter based', meterInterval: 500, lastDoneAt: 1000 }),
        rec('MP-3', 'eam.plans', 'active', { task: 'Liner', asset: 'AST-1', strategy: 'Time based', interval: 30, nextDue: '2026-12-01' }),
      ],
      'eam.workorders': [rec('WO-1', 'eam.workorders', 'open', { task: 'Bearing', asset: 'AST-1', kind: 'Preventive' })],
    }
    const due = duePlans(all, today)
    expect(due.map((d) => d.plan.id)).toEqual(['MP-1'])
    expect(due[0]?.update.nextDue).toBe('2026-12-13')
  })

  it('asks to restock a part at its minimum unless a requisition is already open', () => {
    const all = {
      'mdm.materials': [rec('MAT-11', 'mdm.materials', 'active', { code: 'MRO-SPARE' })],
      'eam.parts': [rec('SP-1', 'eam.parts', 'active', { partNo: 'SP-111', name: 'Bearing', onHand: 1, minStock: 4, unitCost: 100 }), rec('SP-2', 'eam.parts', 'active', { partNo: 'SP-222', name: 'Belt', onHand: 0, minStock: 2 })],
      'vms.requisitions': [rec('PR-1', 'vms.requisitions', 'submitted', { title: 'Restock SP-222 Belt' })],
    }
    const low = lowStock(all, today)
    expect(low.map((l) => l.part.id)).toEqual(['SP-1'])
    expect(low[0]?.requisition).toMatchObject({ qty: 7, value: 700, material: 'MAT-11' })
  })

  it('lists approvals waiting three days or more', () => {
    const type = RECORD_TYPES.find((t) => t.key === 'vms.requisitions')!
    const all = { 'vms.requisitions': [rec('PR-1', type.key, 'submitted', {}, '2026-11-01T00:00:00Z'), rec('PR-2', type.key, 'submitted', {}, '2026-11-12T00:00:00Z')] }
    expect(staleApprovals([type], all, today).map((s) => s.record.id)).toEqual(['PR-1'])
  })
})
