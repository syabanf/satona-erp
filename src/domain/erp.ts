/** Satona Group ERP: entities, modules, roles and the access rules between them. */
import { moduleLabel } from './uiLabels'

export type EntityId = 'holding' | 'rotama' | 'rodame' | 'roasi'

export interface Entity {
  id: EntityId
  name: string
  short: string
  sector: string
  /** Series slot for every chart and map mark of this entity. */
  slot: 1 | 2 | 3 | 4 | 5
  headcount: number
  revenueYtd: number
  /** Twelve months, oldest first, in rupiah. */
  revenue: readonly number[]
  kpis: ReadonlyArray<{ label: string; value: number; unit: string; delta: number }>
}

export type ScopeStatus = 'live' | 'build' | 'plan'

export interface ScopeItem {
  id: string
  title: string
  status: ScopeStatus
  owner: string
  /** Sprint milestones; the done count drives the progress bar. */
  milestones: number
  done: number
}

export interface ErpModule {
  id: string
  entity: EntityId
  code: string
  name: string
  scope: readonly ScopeItem[]
  departments: readonly string[]
  users: readonly string[]
  kpis: ReadonlyArray<{ label: string; value: string }>
  /** A live operational view for this module, when the demo has one. */
  live?: { to: string; label: string }
}

export interface Role {
  id: string
  name: string
  entity: EntityId
  module: string
  department: string
  seats: number
  external: boolean
}

export type Access = 'full' | 'approve' | 'portal' | 'view' | 'none'

export const SCOPE_LABEL: Record<ScopeStatus, string> = { live: 'Aktif', build: 'Dibangun', plan: 'Direncanakan' }
export const ACCESS_LABEL: Record<Access, string> = { full: 'Kelola', approve: 'Setujui', portal: 'Portal', view: 'Lihat', none: 'Tidak ada' }

/** Done milestones over all milestones across the module's scope. */
export function moduleProgress(m: Pick<ErpModule, 'scope'>): number {
  const total = m.scope.reduce((s, i) => s + i.milestones, 0)
  return total ? m.scope.reduce((s, i) => s + i.done, 0) / total : 0
}

export function moduleStatus(m: Pick<ErpModule, 'scope'>): ScopeStatus {
  if (m.scope.every((i) => i.status === 'live')) return 'live'
  if (m.scope.some((i) => i.status !== 'plan')) return 'build'
  return 'plan'
}

const LEAD = /head|manager|director|cfo|controller|direksi|supervisor|kepala/i
const EXEC = /cfo|direksi|business analyst|general manager/i

/**
 * Access of a role to a module. A role runs its own module (leads approve there), leads read the other modules
 * of their entity, and holding executives read everything. External users (drivers, vendors, distributors) only
 * reach their own module, through a portal that reads records and moves them along, without creating or deleting.
 */
export function accessOf(role: Role, module: Pick<ErpModule, 'id' | 'entity'>): Access {
  if (role.id === ADMIN_ROLE.id) return 'approve'
  if (role.module === module.id) return role.external ? 'portal' : LEAD.test(role.name) ? 'approve' : 'full'
  if (role.external) return 'none'
  if (role.entity === 'holding' && EXEC.test(role.name)) return 'view'
  if (role.entity === module.entity && LEAD.test(role.name)) return 'view'
  return 'none'
}

/** The demo's default session: the group IT lead who administers every module. */
export interface AccessOverride {
  role: string
  module: string
  access: Access
}

/** The matrix access unless an administrator set an override for this role and module; the admin role is never overridden. */
export function effectiveAccess(role: Role, module: Pick<ErpModule, 'id' | 'entity'>, overrides: readonly AccessOverride[] = []): Access {
  const o = role.id === ADMIN_ROLE.id ? undefined : overrides.find((x) => x.role === role.name && x.module.toLowerCase() === module.id)
  return o ? o.access : accessOf(role, module)
}

export const ADMIN_ROLE: Role = {
  id: 'admin',
  name: 'Group IT Program Lead',
  entity: 'holding',
  module: 'mdm',
  department: 'IT Security',
  seats: 1,
  external: false,
}

export type Action = 'read' | 'step' | 'create' | 'edit' | 'delete' | 'approve'

/** View reads; portal also takes ordinary workflow steps; full also creates, edits and deletes; approve also approves. */
export function can(access: Access, action: Action): boolean {
  if (access === 'none') return false
  if (access === 'view') return action === 'read'
  if (access === 'portal') return action === 'read' || action === 'step'
  return action !== 'approve' || access === 'approve'
}

export interface ModuleCriteria {
  entity?: EntityId
  status?: ScopeStatus
  q?: string
}

export function filterModules(list: readonly ErpModule[], { entity, status, q }: ModuleCriteria) {
  const needle = q?.trim().toLowerCase()
  return list.filter(
    (m) =>
      (!entity || m.entity === entity) &&
      (!status || moduleStatus(m) === status) &&
      (!needle ||
        [m.name, moduleLabel(m.id), m.code, ...m.departments, ...m.users, ...m.scope.map((s) => s.title)].some((t) => t.toLowerCase().includes(needle))),
  )
}

export interface RoleCriteria {
  entity?: EntityId
  kind?: 'internal' | 'external'
  q?: string
}

export function filterRoles(list: readonly Role[], { entity, kind, q }: RoleCriteria) {
  const needle = q?.trim().toLowerCase()
  return list.filter(
    (r) =>
      (!entity || r.entity === entity) &&
      (!kind || (kind === 'external') === r.external) &&
      (!needle || r.name.toLowerCase().includes(needle) || r.department.toLowerCase().includes(needle)),
  )
}

/** Counts per value of `pick`, used for chip counts that respect every other filter. */
export function countBy<T, K extends string>(list: readonly T[], pick: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const item of list) {
    const k = pick(item)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}
