import { describe, expect, it } from 'vitest'
import { typeOf } from '@/domain/catalog'
import { GAP_ITEMS } from './items'

describe('gap coverage', () => {
  it('lists all 57 rows once', () => {
    expect(GAP_ITEMS.map((i) => i.no)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1))
  })
  it('links only to record types that exist', () => {
    for (const item of GAP_ITEMS)
      for (const [, to] of item.links) {
        const m = /^\/modules\/(\w+)\/(\w+)$/.exec(to)
        if (m) expect(typeOf(`${m[1]}.${m[2]}`), `#${item.no} ${to}`).toBeDefined()
      }
  })
})
