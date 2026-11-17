import { describe, expect, it } from 'vitest'
import type { ErpRecord } from './records'
import { areaOf, areasFor, canFileOwn, clockResult, employeeOf, isRestDay, isSupervisor, leaveBalance, selfMenuFor, shiftOn, teamRequests, weekOf } from './selfService'

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
  it('runs four crews around the clock, keeps office staff on weekdays and honours an approved swap', () => {
    const shifts = ['Office', 'Morning', 'Afternoon', 'Night'].map((name, i) => rec(`SHF-${i}`, { name }))
    const crew = (id: string, c: string) => rec(id, { crew: c })
    const crews = [crew('EMP-A', 'A'), crew('EMP-B', 'B'), crew('EMP-C', 'C'), crew('EMP-D', 'D')]
    expect(weekOf('2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    // Every day has one crew on each shift and one crew off.
    for (const date of weekOf('2026-11-18')) expect(crews.map((c) => String(shiftOn(c, date, shifts)?.values.name)).sort()).toEqual(['Afternoon', 'Morning', 'Night', 'undefined'])
    const cycle = Array.from({ length: 8 }, (_, i) => String(shiftOn(crews[0]!, new Date(Date.UTC(2026, 10, 16 + i)).toISOString().slice(0, 10), shifts)?.values.name))
    expect([...cycle, ...cycle].join()).toContain('Morning,Morning,Afternoon,Afternoon,Night,Night,undefined,undefined')
    const office = crew('EMP-O', 'Office')
    expect(shiftOn(office, '2026-11-20', shifts)?.values.name).toBe('Office')
    expect(shiftOn(office, '2026-11-21', shifts)).toBeUndefined()
    expect(isRestDay(office, '2026-11-22', [])).toBe(true)
    expect(isRestDay(office, '2026-11-18', [rec('HOL-1', { date: '2026-11-18', kind: 'National holiday' })])).toBe(true)
    const [a, b] = [crews[0]!, crews[2]!]
    const swap = rec('SWP-1', { employee: a.id, partner: b.id, date: '2026-11-18' }, 'approved')
    expect(shiftOn(a, '2026-11-18', shifts, [swap], crews)).toBe(shiftOn(b, '2026-11-18', shifts))
    expect(shiftOn(b, '2026-11-18', shifts, [swap], crews)).toBe(shiftOn(a, '2026-11-18', shifts))
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
