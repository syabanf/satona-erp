import { describe, expect, it } from 'vitest'
import { RECORD_TYPES } from './catalog'
import { CONVERSIONS, conversionsFor } from './conversions'
import type { ErpRecord } from './records'

const rec = (id: string, type: string, status: string, values: ErpRecord['values']): ErpRecord => ({ id, type, status, values, createdAt: '', updatedAt: '', history: [] })

describe('document conversions', () => {
  it('only names record types and fields that exist', () => {
    for (const c of CONVERSIONS) {
      const to = RECORD_TYPES.find((t) => t.key === c.to)
      expect(RECORD_TYPES.some((t) => t.key === c.from), c.from).toBe(true)
      expect(to, c.to).toBeDefined()
      if (c.link) expect(to!.fields.some((f) => f.key === c.link), `${c.to}.${c.link}`).toBe(true)
      const keys = Object.keys(c.map(rec('X-1', c.from, 'x', {}), {}, '2026-11-13'))
      for (const k of keys) expect(to!.fields.some((f) => f.key === k), `${c.to}.${k}`).toBe(true)
    }
  })

  it('offers a step only in the allowed status and lists what it already made', () => {
    const pr = rec('PR-1', 'vms.requisitions', 'approved', { title: 'Soda', qty: 5 })
    const all = { 'vms.orders': [rec('PO-1', 'vms.orders', 'draft', { requisition: 'PR-1' })] }
    expect(conversionsFor('vms.requisitions', { ...pr, status: 'draft' }, all)).toHaveLength(0)
    const [step] = conversionsFor('vms.requisitions', pr, all)
    expect(step?.made.map((r) => r.id)).toEqual(['PO-1'])
    expect(step?.map(pr, all, '2026-11-13')).toMatchObject({ requisition: 'PR-1', qty: 5 })
  })
})
