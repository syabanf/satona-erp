import { describe, expect, it } from 'vitest'
import { RECORD_TYPES } from './catalog'
import { subModuleOf, subModulesOf } from './subModules'

describe('sub-modules', () => {
  it('files every record type of a grouped module under one of its sub-modules', () => {
    for (const t of RECORD_TYPES) {
      if (!subModulesOf(t.module).length) continue
      expect(subModuleOf(t.key), t.key).toBeDefined()
    }
  })

  it('leaves small modules ungrouped', () => {
    expect(subModuleOf('gtr.lots')).toBeUndefined()
    expect(subModuleOf('eam.parts')).toBe('Suku cadang')
  })
})
