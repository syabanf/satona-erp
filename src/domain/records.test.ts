import { describe, expect, it } from 'vitest'
import { calc, flow, n, num, pick, ref, text, type } from './catalog/kit'
import { approvalInbox } from './approval'
import { allowedTransitions, ancestors, descendants, rollup, computeValues, filterRecords, nextId, referencedBy, sortRecords, summarize, validate, type ErpRecord } from './records'

const orders = type('x', 'orders', ['Orders', 'Order', 'ORD'], 'name', [
  text('name', 'Name', { required: true }),
  num('qty', 'Qty', 't', { required: true, min: 1 }),
  num('price', 'Price', undefined, { min: 0 }),
  pick('kind', 'Kind', ['A', 'B']),
  calc('total', 'Total', (v) => n(v, 'qty') * n(v, 'price')),
], flow(
  [
    ['draft', 'Draft', 'neutral'],
    ['sent', 'Sent', 'info'],
    ['ok', 'Approved', 'success'],
  ],
  [
    ['draft', 'sent', 'Send'],
    ['sent', 'ok', 'Approve', 'approve'],
  ],
), { sumField: 'total', groupBy: 'kind', dateField: 'day' })
const notes = type('x', 'notes', ['Notes', 'Note', 'NTE'], 'name', [text('name', 'Name'), ref('order', 'Order', 'x.orders')], orders.workflow)

const rec = (id: string, values: ErpRecord['values'], status = 'draft', createdAt = '2026-10-01T00:00:00Z'): ErpRecord => ({ id, type: 'x.orders', status, values, createdAt, updatedAt: createdAt, history: [] })

describe('record rules', () => {
  it('validates required, numeric bounds and options', () => {
    expect(validate(orders, { name: 'a', qty: 2 })).toEqual({})
    expect(Object.keys(validate(orders, { qty: 0, kind: 'Z' }))).toEqual(['name', 'qty', 'kind'])
    expect(validate(orders, { name: 'a', qty: 'two' }).qty).toMatch(/number/)
  })

  it('stores numbers as numbers and fills computed fields', () => {
    expect(computeValues(orders, { name: 'a', qty: '3', price: '5' })).toMatchObject({ qty: 3, price: 5, total: 15 })
  })

  it('offers approval steps only to approvers, ordinary steps to portal users', () => {
    expect(allowedTransitions(orders, 'sent', 'full')).toEqual([])
    expect(allowedTransitions(orders, 'sent', 'approve').map((t) => t.to)).toEqual(['ok'])
    expect(allowedTransitions(orders, 'draft', 'portal').map((t) => t.to)).toEqual(['sent'])
    expect(allowedTransitions(orders, 'draft', 'view')).toEqual([])
  })

  it('filters, sorts and numbers records', () => {
    const rows = [rec('ORD-0002', { name: 'beta', qty: 5, kind: 'B' }, 'sent'), rec('ORD-0010', { name: 'alpha', qty: 1, kind: 'A' })]
    expect(filterRecords(rows, { status: 'sent' }).map((r) => r.id)).toEqual(['ORD-0002'])
    expect(filterRecords(rows, { q: 'ALP' }).map((r) => r.id)).toEqual(['ORD-0010'])
    expect(filterRecords(rows, { where: { kind: 'B' } }).map((r) => r.id)).toEqual(['ORD-0002'])
    expect(sortRecords(rows, 'qty').map((r) => r.id)).toEqual(['ORD-0010', 'ORD-0002'])
    expect(sortRecords(rows, 'name', 'desc').map((r) => r.id)).toEqual(['ORD-0002', 'ORD-0010'])
    expect(nextId(orders, rows)).toBe('ORD-0011')
  })

  it('summarises counts, sums, groups and months', () => {
    const rows = [rec('ORD-0001', { qty: 2, price: 10, total: 20, kind: 'A', day: '2026-10-05' }), rec('ORD-0002', { qty: 1, price: 5, total: 5, kind: 'A', day: '2026-09-20' }, 'sent')]
    const s = summarize(orders, rows, '2026-10-30', 3)
    expect(s).toMatchObject({ count: 2, sum: 25, byStatus: { draft: 1, sent: 1 } })
    expect(s.byGroup).toEqual([{ key: 'A', count: 2, sum: 25 }])
    expect(s.monthly.map((m) => [m.month, m.sum])).toEqual([['2026-08', 0], ['2026-09', 5], ['2026-10', 20]])
  })

  it('finds references and the approval queue', () => {
    const all = { 'x.orders': [rec('ORD-0001', { name: 'a' }, 'sent')], 'x.notes': [{ ...rec('NTE-0001', { order: 'ORD-0001' }), type: 'x.notes' }] }
    expect(referencedBy('ORD-0001', [orders, notes], all).map((x) => x.record.id)).toEqual(['NTE-0001'])
    expect(approvalInbox([orders, notes], all, () => 'approve', { id: 'r', name: 'r' }, '2026-10-30').map((x) => x.record.id)).toEqual(['ORD-0001'])
    expect(approvalInbox([orders, notes], all, () => 'full', { id: 'r', name: 'r' }, '2026-10-30')).toEqual([])
  })
})

describe('parent-child mapping', () => {
  const wh = type('w', 'houses', ['Warehouses', 'Warehouse', 'WH'], 'name', [text('name', 'Name')], orders.workflow)
  const bins = type('w', 'bins', ['Bins', 'Bin', 'BIN'], 'name', [text('name', 'Name'), ref('house', 'Warehouse', 'w.houses', { required: true })], orders.workflow)
  const lots = type('w', 'lots', ['Lots', 'Lot', 'LOT'], 'name', [text('name', 'Name'), ref('other', 'Other', 'w.houses'), ref('bin', 'Bin', 'w.bins', { parent: true }), num('qty', 'Qty', 't', { list: true })], orders.workflow)
  const r = (type: string, id: string, values: ErpRecord['values']): ErpRecord => ({ id, type, status: 'draft', values, createdAt: '', updatedAt: '', history: [] })
  const all = {
    'w.houses': [r('w.houses', 'WH-1', { name: 'Surabaya' })],
    'w.bins': [r('w.bins', 'BIN-1', { house: 'WH-1' }), r('w.bins', 'BIN-2', { house: 'WH-1' })],
    'w.lots': [r('w.lots', 'LOT-1', { bin: 'BIN-1', qty: 5, other: 'WH-1' }), r('w.lots', 'LOT-2', { bin: 'BIN-2', qty: 7 })],
  }
  const types = [wh, bins, lots]

  it('walks up to the root and down to the leaves', () => {
    expect(ancestors(lots, all['w.lots'][0]!, types, all).map((a) => a.record.id)).toEqual(['WH-1', 'BIN-1'])
    const tree = descendants(wh, all['w.houses'][0]!, types, all)
    expect(tree.map((n) => [n.record.id, n.children.map((c) => c.record.id)])).toEqual([['BIN-1', ['LOT-1']], ['BIN-2', ['LOT-2']]])
    expect(rollup(tree).map((x) => [x.type.key, x.count, x.sum])).toEqual([['w.bins', 2, 0], ['w.lots', 2, 12]])
  })
})
