import { describe, expect, it } from 'vitest'
import { RECORD_TYPES, typeOf } from '@/domain/catalog'
import { ADMIN_ROLE, type Role } from '@/domain/erp'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { validate } from '@/domain/records'
import { createMockPorts } from '@/infrastructure/mock'
import { MODULES } from '@/infrastructure/mock/data/erp'
import { createServices } from './services'

const clock = { today: () => '2026-10-30' }
const role = (name: string, module: string, entity: Role['entity'], external = false): Role => ({ id: name, name, entity, module, department: 'x', seats: 1, external })

describe('catalogue and seeds', () => {
  it('gives every module at least one record type', () => {
    for (const m of MODULES) expect(RECORD_TYPES.some((t) => t.module === m.id), m.id).toBe(true)
  })

  it('seeds rows that pass their schema and refs that resolve', async () => {
    const { records } = createMockPorts(clock)
    const all = await records.all()
    for (const type of RECORD_TYPES) {
      const rows = all[type.key] ?? []
      expect(rows.length, type.key).toBeGreaterThan(0)
      for (const r of rows) {
        expect(validate(type, r.values), `${type.key} ${r.id}`).toEqual({})
        expect(type.workflow.states.some((s) => s.id === r.status), `${r.id} status ${r.status}`).toBe(true)
        for (const f of type.fields.filter((x) => x.type === 'ref')) {
          if (r.values[f.key]) expect(all[f.ref ?? '']?.some((x) => x.id === r.values[f.key]), `${r.id}.${f.key}`).toBe(true)
        }
      }
    }
  })
})

describe('record use cases', () => {
  const services = () => createServices(createMockPorts(clock))
  const trip = { route: 'Cilegon → Cikampek', vehicle: 'VEH-0001', driver: 'Agus Santoso', cargo: 'MAT-0004', qty: 24, distance: 140, departure: '2026-11-02' }

  it('creates with a fresh id and the initial state, then walks the workflow', async () => {
    const s = services()
    const created = await s.records.create(ADMIN_ROLE, 'tms.trips', trip)
    expect(created.status).toBe('planned')
    expect(created.id).toMatch(/^TRP-\d{4}$/)
    const moved = await s.records.transition(ADMIN_ROLE, 'tms.trips', created.id, 'dispatched')
    expect(moved.status).toBe('dispatched')
    expect(moved.history.at(-1)?.action).toBe('Dispatch')
    expect((await s.records.events())[0]?.topic).toBe('tms.trips')
  })

  it('computes derived fields on save', async () => {
    const s = services()
    const inv = await s.records.create(ADMIN_ROLE, 'fbl.invoices', { trip: 'TRP-0001', billTo: 'External customer', distance: 100, ratePerKm: 10000, margin: 10, issued: '2026-10-30' })
    expect(inv.values.amount).toBe(1_100_000)
  })

  it('rejects invalid values with field messages', async () => {
    await expect(services().records.create(ADMIN_ROLE, 'tms.trips', { ...trip, qty: 0 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps view-only and external roles out', async () => {
    const s = services()
    const driver = role('Driver (Driver App)', 'tms', 'rotama', true)
    await expect(s.records.create(driver, 'fbl.invoices', {})).rejects.toBeInstanceOf(ForbiddenError)
    const dispatcher = role('Transport Dispatcher / Planner', 'tms', 'rotama')
    const created = await s.records.create(dispatcher, 'tms.trips', trip)
    await expect(s.records.transition(dispatcher, 'tms.trips', created.id, 'dispatched')).rejects.toBeInstanceOf(ForbiddenError)
    const manager = role('Fleet Manager', 'tms', 'rotama')
    expect((await s.records.transition(manager, 'tms.trips', created.id, 'dispatched')).status).toBe('dispatched')
  })

  it('deletes and resets', async () => {
    const s = services()
    const before = (await s.records.list('grc.risks')).length
    await s.records.remove(ADMIN_ROLE, 'grc.risks', 'RSK-0001')
    expect(await s.records.list('grc.risks')).toHaveLength(before - 1)
    await s.records.reset()
    expect(await s.records.list('grc.risks')).toHaveLength(before)
    expect(typeOf('grc.risks')).toBeDefined()
  })
})

describe('multilevel approval', { timeout: 20_000 }, () => {
  const services = () => createServices({ ...createMockPorts(clock), clock })

  it('walks a large PO through procurement, finance control and the CFO', async () => {
    const s = services()
    const buyer = role('Procurement Specialist', 'vms', 'holding')
    const po = await s.records.create(buyer, 'vms.orders', { title: 'Sulfur Q1', vendor: 'BP-0001', material: 'MAT-0003', qty: 900, value: 1_800_000_000, delivery: '2026-12-01' })
    await s.records.transition(buyer, 'vms.orders', po.id, 'submitted')
    await expect(s.records.transition(role('CFO / Finance Director', 'epm', 'holding'), 'vms.orders', po.id, 'released')).rejects.toThrow('Level 1 of 3 waits for Head of Procurement')
    const l1 = await s.records.transition(role('Head of Procurement', 'vms', 'holding'), 'vms.orders', po.id, 'released')
    expect([l1.status, l1.approvals?.length]).toEqual(['submitted', 1])
    // The CFO delegated to the Financial Controller, but level 2 belongs to the Finance Controller.
    const l2 = await s.records.transition(role('Finance Controller', 'fin', 'holding'), 'vms.orders', po.id, 'released')
    expect(l2.status).toBe('submitted')
    const done = await s.records.transition(role('Financial Controller', 'epm', 'holding'), 'vms.orders', po.id, 'released')
    expect([done.status, done.approvals?.map((a) => a.by)]).toEqual(['released', ['Head of Procurement', 'Finance Controller', 'Financial Controller']])
  })

  it('lets a level holder reject and clears the signatures', async () => {
    const s = services()
    const buyer = role('Procurement Specialist', 'vms', 'holding')
    const po = await s.records.create(buyer, 'vms.orders', { title: 'Caustic', vendor: 'BP-0001', material: 'MAT-0005', qty: 50, value: 900_000_000, delivery: '2026-12-01' })
    await s.records.transition(buyer, 'vms.orders', po.id, 'submitted')
    await s.records.transition(role('Head of Procurement', 'vms', 'holding'), 'vms.orders', po.id, 'released')
    const rejected = await s.records.transition(role('Finance Controller', 'fin', 'holding'), 'vms.orders', po.id, 'rejected')
    expect([rejected.status, rejected.approvals]).toEqual(['rejected', undefined])
  })

  it('applies permission overrides from the administration module', async () => {
    const s = services()
    const analyst = role('Business Analyst', 'bi', 'holding')
    const she = typeOf('she.permits')!
    expect(await s.records.accessFor(analyst, she)).toBe('view')
    expect(await s.records.accessFor(role('Plant Manager', 'cfp', 'roasi'), she)).toBe('full')
  })
})
