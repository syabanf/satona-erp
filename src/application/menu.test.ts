import { describe, expect, it } from 'vitest'
import { RECORD_TYPES } from '@/domain/catalog'
import { accessOf, ADMIN_ROLE, type Role } from '@/domain/erp'
import { buildMenu, findByTcode, folderPath, searchMenu, trail, walk } from '@/domain/menu'
import { ENTITIES, MODULES, ROLES } from '@/infrastructure/mock/data/erp'

const menuFor = (role: Role) =>
  buildMenu({ entities: ENTITIES, modules: MODULES, types: RECORD_TYPES, accessFor: (id) => accessOf(role, MODULES.find((m) => m.id === id)!) })

describe('SAP-style menu', () => {
  const tree = menuFor(ADMIN_ROLE)

  it('gives every leaf a unique transaction code', () => {
    const codes = [...walk(tree)].filter((n) => n.to).map((n) => n.tcode)
    expect(codes.every(Boolean)).toBe(true)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('files every record type under master data or transactions with a create and a list item', () => {
    for (const t of RECORD_TYPES) {
      expect(findByTcode(tree, `${t.prefix}01`)?.to, t.key).toMatch(/\/new$/)
      expect(findByTcode(tree, `${t.prefix}02`)?.to, t.key).toContain(`/modules/${t.module}/`)
    }
  })

  it('accepts SAP command syntax and searches labels', () => {
    expect(findByTcode(tree, '/ntrp01')?.label).toBe('Buat perjalanan')
    expect(findByTcode(tree, 'nope')).toBeUndefined()
    expect(searchMenu(tree, 'oee').some((n) => n.tcode === 'OEE02')).toBe(true)
  })

  it('finds the breadcrumb trail for records, lists and approval worklists', () => {
    expect(trail(tree, '/modules/tms/trips/TRP-0001').map((n) => n.label)).toEqual(['Rotama', 'Transportasi', 'Aktivitas', 'Perjalanan', 'Daftar perjalanan'])
    expect(trail(tree, '/modules/tms/trips', '?status=planned').at(-1)?.kind).toBe('approval')
    expect(trail(tree, '/').at(-1)?.tcode).toBe('ZOV')
  })

  it('gives a folder page the folder trail', () => {
    expect(trail(tree, folderPath('tms:master')).map((n) => n.label)).toEqual(['Rotama', 'Transportasi', 'Data utama'])
    expect(trail(tree, folderPath('nope'))).toEqual([])
  })

  it('hides closed modules and write items from portal users', () => {
    const driver = ROLES.find((r) => r.name.startsWith('Driver'))!
    const leaves = [...walk(menuFor(driver))].filter((n) => n.to)
    expect(leaves.some((n) => n.to?.startsWith('/modules/fbl'))).toBe(false)
    expect(leaves.filter((n) => n.kind === 'create').map((n) => n.tcode)).toEqual(['CHK01'])
    expect(leaves.some((n) => n.tcode === 'TRP02')).toBe(true)
    expect(menuFor(driver).map((n) => n.label)).toEqual(['Ringkasan grup', 'Rotama'])
  })
})
