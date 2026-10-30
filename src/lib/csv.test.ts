import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(toCsv([['id', 'note'], ['A-1', 'Rp 1,000'], ['A-2', 'said "ok"\nthen left']])).toBe('id,note\r\nA-1,"Rp 1,000"\r\nA-2,"said ""ok""\nthen left"')
  })
})
