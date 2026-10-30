import { describe, expect, it } from 'vitest'
import { approvalChain, isPendingApproval, maySign, moveBlocker, pendingStep } from './approval'
import type { ErpRecord, RecordType } from './records'

const type = { key: 'vms.orders', insight: { sumField: 'value' }, workflow: { states: [], transitions: [], initial: 'draft' } } as unknown as RecordType
const row = (id: string, values: ErpRecord['values'], status = 'active'): ErpRecord => ({ id, type: 'x', status, values, createdAt: '', updatedAt: '', history: [] })

const rules = [
  row('AM-1', { docType: 'vms.orders', entity: 'all', min: 0, max: 500_000_000 }),
  row('AM-2', { docType: 'vms.orders', entity: 'all', min: 500_000_001, max: 0 }),
  row('AM-3', { docType: 'vms.orders', entity: 'roasi', min: 500_000_001, max: 0 }),
]
const levels = [
  row('L1', { rule: 'AM-1', level: 1, approver: 'Head of Procurement', sla: 24 }),
  row('L2', { rule: 'AM-2', level: 2, approver: 'CFO / Finance Director', sla: 48 }),
  row('L3', { rule: 'AM-2', level: 1, approver: 'Head of Procurement', sla: 24 }),
  row('L4', { rule: 'AM-3', level: 1, approver: 'Plant Manager', sla: 24 }),
  row('L5', { rule: 'AM-3', level: 2, approver: 'CFO / Finance Director', sla: 48 }),
  row('L6', { rule: 'AM-3', level: 3, approver: 'Direksi', sla: 72 }, 'inactive'),
]

describe('approval matrix', () => {
  it('picks the amount band and sorts levels', () => {
    expect(approvalChain(type, { values: { value: 100_000_000, entity: 'rodame' } }, { rules, levels }).map((s) => s.role)).toEqual(['Head of Procurement'])
    expect(approvalChain(type, { values: { value: 900_000_000, entity: 'rodame' } }, { rules, levels }).map((s) => s.level)).toEqual([1, 2])
  })

  it('prefers an entity rule and skips inactive levels', () => {
    expect(approvalChain(type, { values: { value: 900_000_000, entity: 'roasi' } }, { rules, levels }).map((s) => s.role)).toEqual(['Plant Manager', 'CFO / Finance Director'])
  })

  it('returns no chain for a document without a rule', () => {
    expect(approvalChain({ ...type, key: 'hrs.leaves' }, { values: {} }, { rules, levels })).toEqual([])
  })

  it('walks the levels and honours delegations', () => {
    const chain = approvalChain(type, { values: { value: 900_000_000, entity: 'rodame' } }, { rules, levels })
    expect(pendingStep(chain, [{ level: 1, role: 'Head of Procurement', by: 'x', at: '' }])?.role).toBe('CFO / Finance Director')
    const step = chain[1]!
    const delegation = row('DLG-1', { fromRole: 'CFO / Finance Director', toRole: 'Finance Controller', from: '2026-10-01', to: '2026-10-31' })
    expect(maySign(step, { id: 'r', name: 'Finance Controller' }, [delegation], '2026-10-30')).toBe(true)
    expect(maySign(step, { id: 'r', name: 'Finance Controller' }, [delegation], '2026-11-02')).toBe(false)
    expect(maySign(step, { id: 'admin', name: 'Admin' }, [], '2026-10-30')).toBe(true)
  })
})

describe('move blockers', () => {
  it('stops a permit with a failed gas test', () => {
    const permits = { key: 'she.permits' } as RecordType
    expect(moveBlocker(permits, { values: { gasTest: 'Fail', lel: 14 } }, 'approved')).toMatch(/LEL 14%/)
    expect(moveBlocker(permits, { values: { gasTest: 'Fail' } }, 'rejected')).toBeUndefined()
    expect(moveBlocker(permits, { values: { gasTest: 'Pass' } }, 'approved')).toBeUndefined()
  })
})

describe('approval queue', () => {
  it('keeps reopening closed records out of pending approvals', () => {
    const item = (status: string, label: string) => ({ record: row('A-1', {}, status), moves: [{ label }] }) as Parameters<typeof isPendingApproval>[0]
    expect(isPendingApproval(item('closed', 'Reopen'))).toBe(false)
    expect(isPendingApproval(item('submitted', 'Approve'))).toBe(true)
    expect(isPendingApproval(item('progress', 'Close'))).toBe(false)
  })
})
