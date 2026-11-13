import { describe, expect, it } from 'vitest'
import { parseTable, toCsv } from './csv'

describe('toCsv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(toCsv([['id', 'note'], ['A-1', 'Rp 1,000'], ['A-2', 'said "ok"\nthen left']])).toBe('id,note\r\nA-1,"Rp 1,000"\r\nA-2,"said ""ok""\nthen left"')
  })
})

describe('parseTable', () => {
  it('reads CSV with quotes, commas and line breaks inside cells', () => {
    expect(parseTable('name,note\r\n"Pump, A","said ""hi""\nthen left"\n\n')).toEqual([['name', 'note'], ['Pump, A', 'said "hi"\nthen left']])
  })
  it('reads cells pasted from Excel and semicolon CSV', () => {
    expect(parseTable('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseTable('a;b\n1,5;2')).toEqual([['a', 'b'], ['1,5', '2']])
  })
})
