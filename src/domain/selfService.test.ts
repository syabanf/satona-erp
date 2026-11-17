import { describe, expect, it } from 'vitest'
import type { ErpRecord } from './records'
import { areaOf, areasFor, canFileOwn, clockResult, employeeOf, isSupervisor, leaveBalance, selfMenuFor, shiftOn, teamRequests, weekOf } from './selfService'

const rec = (id: string, values: ErpRecord['values'], status = 'active'): ErpRecord => ({ id, type: 't', status, values, createdAt: '', updatedAt: '', history: [] })

describe('areas', () => {
  it('gives staff both areas, the self-service role only the employee area and outside parties only the back office', () => {
    expect(areasFor({ name: 'HR Manager', external: false })).toEqual(['backoffice', 'employee'])
    expect(areasFor({ name: 'Employee (ESS)', external: true })).toEqual(['employee'])
    expect(areasFor({ name: 'Vendor', external: true })).toEqual(['backoffice'])
  })
  it('reads the area from the path', () => {
    expect(areaOf('/me')).toBe('employee')
    expect(areaOf('/me/leaves')).toBe('employee')
    expect(areaOf('/menu/x')).toBe('backoffice')
  })
  it('lets employees file leave and clock in but not write payroll, and outside parties nothing', () => {
    expect(canFileOwn({ name: 'Finance Staff', external: false }, 'hrs.leaves')).toBe(true)
    expect(canFileOwn({ name: 'Finance Staff', external: false }, 'hrs.attendance')).toBe(true)
    expect(canFileOwn({ name: 'Finance Staff', external: false }, 'hrs.payslips')).toBe(false)
    expect(canFileOwn({ name: 'Vendor', external: true }, 'hrs.leaves')).toBe(false)
  })
})

describe('employee', () => {
  const staff = [rec('EMP-1', { entity: 'holding' }), rec('EMP-2', { entity: 'logistics' }), rec('EMP-3', { entity: 'logistics' }, 'inactive')]
  it('picks the same active employee of the role unit every time', () => {
    const me = employeeOf({ id: 'r1', entity: 'logistics' }, staff)
    expect(me?.id).toBe('EMP-2')
    expect(employeeOf({ id: 'r1', entity: 'logistics' }, staff)).toBe(me)
  })
  it('counts approved leave against the entitlement', () => {
    const leaves = [rec('LV-1', { from: '2026-03-02', days: 3 }, 'approved'), rec('LV-2', { from: '2026-11-20', days: 2 }, 'submitted'), rec('LV-3', { from: '2025-12-20', days: 5 }, 'approved')]
    expect(leaveBalance(leaves, '2026')).toEqual({ taken: 3, waiting: 2, left: 9 })
  })
  it('rotates shifts weekly, rests on Sunday and honours an approved swap', () => {
    const shifts = [rec('SHF-1', { start: '07:00' }), rec('SHF-2', { start: '15:00' })]
    const [a, b] = [rec('EMP-1', {}), rec('EMP-4', {})]
    expect(weekOf('2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(shiftOn(a, '2026-11-22', shifts)).toBeUndefined()
    expect(shiftOn(a, '2026-11-16', shifts)).toBe(shiftOn(a, '2026-11-21', shifts))
    expect(shiftOn(a, '2026-11-16', shifts)).not.toBe(shiftOn(a, '2026-11-23', shifts))
    const swap = rec('SWP-1', { employee: a.id, partner: b.id, date: '2026-11-18' }, 'approved')
    expect(shiftOn(a, '2026-11-18', shifts, [swap])).toBe(shiftOn(b, '2026-11-18', shifts))
    expect(shiftOn(b, '2026-11-18', shifts, [swap])).toBe(shiftOn(a, '2026-11-18', shifts))
    expect(clockResult('07:05', '07:00')).toBe('On time')
    expect(clockResult('07:06', '07:00')).toBe('Late')
  })
  it('gives a supervisor the waiting requests of their team, without their own', () => {
    const staff2 = [rec('EMP-1', { orgunit: 'A' }), rec('EMP-2', { orgunit: 'A' }), rec('EMP-3', { orgunit: 'B' })]
    const leaves = [rec('LV-1', { employee: 'EMP-2' }, 'submitted'), rec('LV-2', { employee: 'EMP-1' }, 'submitted'), rec('LV-3', { employee: 'EMP-3' }, 'submitted'), rec('LV-4', { employee: 'EMP-2' }, 'approved')]
    expect(teamRequests({ 'mdm.employees': staff2, 'hrs.leaves': leaves }, staff2[0]!).map((r) => r.record.id)).toEqual(['LV-1'])
    expect(isSupervisor({ id: 'r', name: 'HR Manager' })).toBe(true)
    expect(isSupervisor({ id: 'r', name: 'Accountant' })).toBe(false)
    expect(selfMenuFor({ id: 'r', name: 'Accountant' }).flatMap(([, items]) => items).some((i) => i.id === 'approvals')).toBe(false)
  })
})
