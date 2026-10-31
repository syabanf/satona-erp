import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TUTORIALS, stepPath } from './tutorials'

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : []))

describe('tutorials', () => {
  it('have unique ids and at least two steps each', () => {
    expect(new Set(ALL_TUTORIALS.map((t) => t.id)).size).toBe(ALL_TUTORIALS.length)
    for (const t of ALL_TUTORIALS) expect(t.steps.length, t.id).toBeGreaterThan(1)
  })

  it('point only at targets the screens mark with data-tour', () => {
    const marked = new Set(sources('src/presentation').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/data-tour="([\w-]+)"/g)].map((m) => m[1])))
    for (const t of ALL_TUTORIALS) for (const s of t.steps) if (s.target) expect(marked.has(s.target), `${t.id}: ${s.target}`).toBe(true)
  })

  it('resolves step routes per role', () => {
    const driver = { id: 'r', name: 'Driver (Driver App)', module: 'tms', external: true }
    expect(stepPath('approvals', driver)).toBe('/approvals')
    expect(stepPath('list', driver)).toBe('/modules/tms/trips')
    expect(stepPath('/coverage', driver)).toBe('/coverage')
    expect(stepPath(undefined, driver)).toBeUndefined()
  })
})
