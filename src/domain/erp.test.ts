import { describe, expect, it } from 'vitest'
import { accessOf, can, countBy, filterModules, filterRoles, moduleProgress, moduleStatus, type ErpModule, type Role } from './erp'

const item = (status: 'live' | 'build' | 'plan', done: number, milestones = 4) => ({ id: status, title: status, status, owner: 'x', milestones, done })
const mod = (id: string, entity: ErpModule['entity'], scope: ErpModule['scope']): ErpModule => ({
  id,
  entity,
  code: id.toUpperCase(),
  name: `Module ${id}`,
  scope,
  departments: ['Finance'],
  users: ['Analyst'],
  kpis: [],
})
const role = (name: string, entity: Role['entity'], module: string, external = false): Role => ({ id: name, name, entity, module, department: 'Dept', seats: 1, external })

describe('modules', () => {
  it('measures progress over milestones and derives status', () => {
    const m = mod('a', 'holding', [item('live', 4), item('build', 2), item('plan', 0, 2)])
    expect(moduleProgress(m)).toBe(0.6)
    expect(moduleStatus(m)).toBe('build')
    expect(moduleStatus(mod('b', 'holding', [item('live', 4)]))).toBe('live')
    expect(moduleStatus(mod('c', 'holding', [item('plan', 0)]))).toBe('plan')
  })

  it('filters by entity, status and text', () => {
    const list = [mod('tms', 'rotama', [item('live', 4)]), mod('qc', 'rodame', [item('build', 1)])]
    expect(filterModules(list, { entity: 'rotama' }).map((m) => m.id)).toEqual(['tms'])
    expect(filterModules(list, { status: 'build' }).map((m) => m.id)).toEqual(['qc'])
    expect(filterModules(list, { q: 'module q' }).map((m) => m.id)).toEqual(['qc'])
    expect(filterModules(list, { q: 'transportasi' }).map((m) => m.id)).toEqual(['tms'])
    expect(countBy(list, moduleStatus)).toEqual({ live: 1, build: 1 })
  })
})

describe('access', () => {
  const tms = { id: 'tms', entity: 'rotama' as const }
  const wms = { id: 'wms', entity: 'rotama' as const }
  it('gives a role its own module, leads approve there', () => {
    expect(accessOf(role('Fleet Manager', 'rotama', 'tms'), tms)).toBe('approve')
    expect(accessOf(role('Transport Dispatcher', 'rotama', 'tms'), tms)).toBe('full')
  })
  it('lets leads read their entity and holding executives read everything', () => {
    expect(accessOf(role('Fleet Manager', 'rotama', 'tms'), wms)).toBe('view')
    expect(accessOf(role('Transport Dispatcher', 'rotama', 'tms'), wms)).toBe('none')
    expect(accessOf(role('CFO / Finance Director', 'holding', 'epm'), wms)).toBe('view')
  })
  it('keeps external users in their own portal', () => {
    expect(accessOf(role('Driver (Driver App)', 'rotama', 'tms', true), tms)).toBe('portal')
    expect(can('portal', 'step')).toBe(true)
    expect(can('portal', 'create')).toBe(false)
    expect(can('full', 'approve')).toBe(false)
    expect(accessOf(role('Driver (Driver App)', 'rotama', 'tms', true), wms)).toBe('none')
    expect(filterRoles([role('Driver', 'rotama', 'tms', true), role('Fleet Manager', 'rotama', 'tms')], { kind: 'external' })).toHaveLength(1)
  })
})
