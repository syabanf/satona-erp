import { describe, expect, it } from 'vitest'
import { typeOf } from './catalog'
import { applyWhere, filterKind, parseWhere, serializeWhere } from './filters'
import type { ErpRecord } from './records'

const type = typeOf('epm.intercompany')!
const row = (id: string, values: ErpRecord['values']): ErpRecord => ({ id, type: type.key, status: 'unmatched', values, createdAt: '', updatedAt: '', history: [] })
const rows = [
  row('ICE-1', { from: 'rotama', to: 'rodame', description: 'Freight NPK Gresik', amount: 400, date: '2026-10-02', difference: 0 }),
  row('ICE-2', { from: 'holding', to: 'roasi', description: 'Management fee', amount: 900, date: '2026-09-15', difference: 35 }),
  row('ICE-3', { from: 'rotama', to: 'roasi', description: 'Freight acid Cilegon', amount: 1200, date: '2026-10-20', difference: 0 }),
]
const ids = (where: Record<string, string>) => applyWhere(type, rows, where).map((r) => r.id)

describe('field filters', () => {
  it('picks a kind per field type', () => {
    const kind = (key: string) => filterKind(type.fields.find((f) => f.key === key)!, rows)
    expect([kind('from'), kind('amount'), kind('date'), kind('description'), kind('difference')]).toEqual(['pick', 'range', 'dates', 'text', 'range'])
  })

  it('combines pick, open ranges, date ranges and words', () => {
    expect(ids({ from: 'rotama' })).toEqual(['ICE-1', 'ICE-3'])
    expect(ids({ amount: '500..' })).toEqual(['ICE-2', 'ICE-3'])
    expect(ids({ amount: '..1000', date: '2026-10-01..2026-10-31' })).toEqual(['ICE-1'])
    expect(ids({ description: 'freight', to: 'roasi' })).toEqual(['ICE-3'])
    expect(ids({ nope: 'x' })).toEqual(['ICE-1', 'ICE-2', 'ICE-3'])
  })

  it('round-trips through the URL, values with separators included', () => {
    const where = { description: 'a;b:c', amount: '10..20' }
    expect(parseWhere(serializeWhere(where))).toEqual(where)
    expect(serializeWhere({ amount: '' })).toBeUndefined()
  })
})
