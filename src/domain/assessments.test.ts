import { describe, expect, it } from 'vitest'
import { courseContent, INSTRUMENTS, scoreChoices, WORK_SCALES, workStyleProfile } from './assessments'

describe('assessments', () => {
  it('scores a choice test as the share answered right', () => {
    const items = INSTRUMENTS.Aritmatika!.items
    expect(scoreChoices(items, items.map((i) => i.answer))).toBe(100)
    expect(scoreChoices(items, items.map((i, k) => (k < 7 ? i.answer : undefined)))).toBe(70)
    expect(scoreChoices(items, [])).toBe(0)
  })

  it('profiles the work-style inventory per scale, each offered four times', () => {
    const first = workStyleProfile(Array(10).fill(0))
    expect(first.map((p) => p.scale)).toEqual([...WORK_SCALES])
    // Leadership is the first option twice and the second option twice, so always picking the first gives it half.
    expect(first.find((p) => p.scale === 'Kepemimpinan')!.share).toBe(50)
    expect(workStyleProfile([]).every((p) => p.share === 0)).toBe(true)
  })

  it('gives every course lessons and a quiz with a right answer', () => {
    for (const title of ['Induksi K3 karyawan baru', 'Kursus tanpa materi khusus']) {
      const c = courseContent(title)
      expect(c.lessons.length).toBeGreaterThan(0)
      expect(c.quiz.every((q) => q.answer !== undefined && q.answer < q.options.length)).toBe(true)
    }
  })
})
