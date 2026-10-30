import { describe, expect, it } from 'vitest'
import { score, search } from './search'

const docs = [
  { id: 'PTW-0012', title: 'Weld support on pipe rack 3', text: 'Hot work Tank farm Merak' },
  { id: 'SIR-0003', title: 'Acid drip from flange', text: 'Near miss Sulfuric acid unit' },
  { id: 'EMP-0012', title: 'Dewi Lestari', text: 'Roasi HSE' },
]

describe('global search', () => {
  it('ranks an exact id over a partial one and a title match', () => {
    expect(search(docs, 'ptw-0012')[0]?.id).toBe('PTW-0012')
    expect(search(docs, '0012').map((d) => d.id)).toEqual(['EMP-0012', 'PTW-0012'])
  })

  it('needs every word, in any field, ignoring case and accents', () => {
    expect(search(docs, 'acid merak')).toEqual([])
    expect(search(docs, 'ACID sulfuric').map((d) => d.id)).toEqual(['SIR-0003'])
    expect(score(docs[2]!, 'déwi')).toBeGreaterThan(0)
  })
})
