import { describe, expect, it } from 'vitest'
import { ADMIN_ROLE, type Access } from './erp'
import { availableTasks, searchTasks, suggestedTasks } from './taskNavigation'

const accessFor = (module: string): Access => module === 'tms' || module === 'vms' ? 'full' : 'none'

describe('task navigation', () => {
  it('only suggests work the role can reach', () => {
    const driver = { ...ADMIN_ROLE, id: 'driver', module: 'tms', external: true }
    const tasks = availableTasks(driver, accessFor, 0)
    expect(tasks.some((task) => task.id === 'checkin')).toBe(true)
    expect(tasks.some((task) => task.id === 'alarms' || task.id === 'modules' || task.id === 'approvals')).toBe(false)
    expect(suggestedTasks(driver, accessFor, 0).every((task) => task.module === 'tms')).toBe(true)
  })

  it('finds everyday task phrases before users need a module code', () => {
    const tasks = availableTasks(ADMIN_ROLE, () => 'approve', 3)
    expect(searchTasks(tasks, 'buat pesanan').map((task) => task.id)).toEqual(['purchase-request'])
    expect(searchTasks(tasks, 'saya ingin cek kendaraan').map((task) => task.id)).toEqual(['checkin'])
  })

  it('fills a role home with its own worklists when it has no curated tasks', () => {
    const role = { ...ADMIN_ROLE, id: 'master-data', module: 'mdm' }
    const suggestions = suggestedTasks(role, (module) => module === 'mdm' ? 'full' : 'none', 0)
    expect(suggestions.filter((task) => task.module === 'mdm')).toHaveLength(3)
    expect(suggestions.at(-1)?.id).toBe('modules')
  })
})
