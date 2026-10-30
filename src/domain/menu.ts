/**
 * SAP Easy Access style menu: Cockpit, then Entity > Module > Master data / Transactions / Reports / Configuration.
 * Every leaf carries a transaction code; the tree hides what the session role cannot reach.
 */
import { can, type Access, type Entity, type ErpModule, type Role } from './erp'
import { canCreate, type RecordType } from './records'

export type MenuKind = 'folder' | 'create' | 'master' | 'transaction' | 'approval' | 'report' | 'config' | 'page'

export interface MenuNode {
  id: string
  label: string
  kind: MenuKind
  tcode?: string
  to?: string
  /** Approval worklists show how many records wait; the sidebar fills the number. */
  approval?: { type: string; status: string }
  children?: MenuNode[]
}

interface MenuInput {
  entities: readonly Pick<Entity, 'id' | 'short'>[]
  modules: readonly Pick<ErpModule, 'id' | 'code' | 'name' | 'entity' | 'live'>[]
  types: readonly RecordType[]
  accessFor: (module: string) => Access
}

/** Extra operational screens filed under a module's reports, after its insight and live view. */
const VIEWS: Record<string, ReadonlyArray<{ label: string; to: string }>> = {
  tms: [
    { label: 'Fleet check-in (P2H & gate)', to: '/fleet/checkin' },
    { label: 'Safety ADAS & DSM', to: '/fleet/safety' },
  ],
  tfm: [{ label: 'Tank farm 3D', to: '/tank-farm?view=3d' }],
  mes: [{ label: 'Plant line 3D', to: '/mes/cockpit?view=3d' }],
}

const path = (t: RecordType) => `/modules/${t.module}/${t.key.split('.')[1]}`
const folder = (id: string, label: string, children: MenuNode[]): MenuNode | null => (children.length ? { id, label, kind: 'folder', children } : null)
const present = (xs: Array<MenuNode | null>) => xs.filter((x): x is MenuNode => x !== null)

function typeItems(t: RecordType, access: Access): MenuNode[] {
  const base = `${t.key}`
  const items: MenuNode[] = []
  if (canCreate(t, access)) items.push({ id: `${base}:create`, label: `Create ${t.singular.toLowerCase()}`, kind: 'create', tcode: `${t.prefix}01`, to: `${path(t)}/new` })
  items.push({ id: `${base}:list`, label: t.area === 'master' ? `Maintain ${t.name.toLowerCase()}` : `${t.name} worklist`, kind: t.area, tcode: `${t.prefix}02`, to: path(t) })
  if (can(access, 'approve')) {
    const waiting = [...new Set(t.workflow.transitions.filter((m) => m.needs === 'approve').map((m) => m.from))]
    waiting.forEach((status, i) => {
      const label = t.workflow.states.find((s) => s.id === status)?.label ?? status
      items.push({ id: `${base}:approve:${status}`, label: `Approve: ${label.toLowerCase()} ${t.name.toLowerCase()}`, kind: 'approval', tcode: `${t.prefix}${String(5 + i).padStart(2, '0')}`, to: `${path(t)}?status=${status}`, approval: { type: t.key, status } })
    })
  }
  return items
}

function moduleNode(m: MenuInput['modules'][number], types: readonly RecordType[], access: Access): MenuNode | null {
  if (access === 'none') return null
  const mine = types.filter((t) => t.module === m.id)
  const group = (area: RecordType['area']) =>
    mine.filter((t) => t.area === area).map((t) => (folder(`${t.key}:folder`, t.name, typeItems(t, access)) as MenuNode))
  const reports: MenuNode[] = [{ id: `${m.id}:insight`, label: `${m.code} insight dashboard`, kind: 'report', tcode: `${m.code}R1`, to: `/modules/${m.id}` }]
  if (m.live) reports.push({ id: `${m.id}:live`, label: m.live.label.replace(/^Open /, '').replace(/^\w/, (c) => c.toUpperCase()), kind: 'report', tcode: `${m.code}R2`, to: m.live.to })
  for (const [i, v] of (VIEWS[m.id] ?? []).entries()) reports.push({ id: `${m.id}:view${i}`, label: v.label, kind: 'report', tcode: `${m.code}R${i + 3}`, to: v.to })
  return folder(`${m.id}`, `${m.code} · ${m.name}`, present([
    folder(`${m.id}:master`, 'Master data', group('master')),
    folder(`${m.id}:transactions`, 'Transactions', group('transaction')),
    folder(`${m.id}:reports`, 'Reports', reports),
    folder(`${m.id}:config`, 'Configuration', [
      { id: `${m.id}:schema`, label: 'Record schemas & workflows', kind: 'config', tcode: `${m.code}C1`, to: `/modules/${m.id}/config` },
      { id: `${m.id}:about`, label: 'Scope, departments & users', kind: 'config', tcode: `${m.code}C2`, to: `/modules/${m.id}/about` },
    ]),
  ]))
}

export function buildMenu({ entities, modules, types, accessFor }: MenuInput): MenuNode[] {
  const cockpit: MenuNode = {
    id: 'cockpit',
    label: 'Group cockpit',
    kind: 'folder',
    children: [
      { id: 'overview', label: 'Executive overview', kind: 'page', tcode: 'ZOV', to: '/' },
      { id: 'approvals', label: 'My approvals', kind: 'page', tcode: 'ZAPP', to: '/approvals' },
      { id: 'catalogue', label: 'Module catalogue', kind: 'page', tcode: 'ZMOD', to: '/modules' },
      { id: 'users', label: 'User & access matrix', kind: 'page', tcode: 'ZUSR', to: '/users' },
      { id: 'integration', label: 'Integration layer & event bus', kind: 'page', tcode: 'ZINT', to: '/integration' },
    ],
  }
  const byEntity = entities.map((e, i) => {
    const mods = present(modules.filter((m) => m.entity === e.id).map((m) => moduleNode(m, types, accessFor(m.id))))
    if (!mods.length) return null
    return folder(`entity:${e.id}`, e.short, [{ id: `entity:${e.id}:home`, label: `${e.short} overview`, kind: 'page', tcode: `ZENT${i + 1}`, to: `/entities/${e.id}` }, ...mods])
  })
  return present([cockpit, ...byEntity])
}

export function* walk(nodes: readonly MenuNode[]): Generator<MenuNode> {
  for (const n of nodes) {
    yield n
    if (n.children) yield* walk(n.children)
  }
}

/** Accepts `TRP01`, `trp01` or SAP's `/nTRP01`. */
export function findByTcode(tree: readonly MenuNode[], input: string): MenuNode | undefined {
  const code = input.trim().replace(/^\/[no]/i, '').toUpperCase()
  if (!code) return undefined
  for (const n of walk(tree)) if (n.tcode === code && n.to) return n
  return undefined
}

/** Leaves whose label or code contains every word of `q`. */
export function searchMenu(tree: readonly MenuNode[], q: string, limit = 12): MenuNode[] {
  const words = q.trim().toLowerCase().replace(/^\/[no]/, '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const out: MenuNode[] = []
  for (const n of walk(tree)) {
    if (!n.to) continue
    const hay = `${n.tcode ?? ''} ${n.label}`.toLowerCase()
    if (words.every((w) => hay.includes(w))) out.push(n)
    if (out.length >= limit) break
  }
  return out
}

/**
 * The folders down to the leaf that best matches the location: same path and query first, then same path,
 * then the longest leaf path the location sits under (a record page sits under its list).
 */
export function trail(tree: readonly MenuNode[], pathname: string, search = ''): MenuNode[] {
  const leaf = (n: MenuNode) => {
    if (!n.to) return -1
    const [p, q = ''] = n.to.split('?')
    if (p === pathname) return q && search.includes(q) ? 3 : q ? 0 : 2
    return p && p !== '/' && pathname.startsWith(`${p}/`) ? 1 + p.length / 1000 : -1
  }
  let best: { score: number; chain: MenuNode[] } = { score: 0, chain: [] }
  const visit = (nodes: readonly MenuNode[], chain: MenuNode[]) => {
    for (const n of nodes) {
      const next = [...chain, n]
      const score = leaf(n)
      if (score > best.score) best = { score, chain: next }
      if (n.children) visit(n.children, next)
    }
  }
  visit(tree, [])
  return best.chain
}

const MODULE_HOME: Record<string, string> = {
  tms: '/fleet',
  mes: '/mes/cockpit',
  eam: '/eam/reliability',
  occ: '/occ',
  tfm: '/tank-farm',
  dms: '/distribution',
  gtr: '/traceability',
}

/** Where a role lands after sign-in: executives on the overview, field roles on their working screen. */
export function homeFor(role: Pick<Role, 'id' | 'name' | 'module' | 'external'>): string {
  if (role.id === 'admin' || /cfo|direksi|business analyst|general manager/i.test(role.name)) return '/'
  if (/driver/i.test(role.name)) return '/fleet/checkin'
  return MODULE_HOME[role.module] ?? `/modules/${role.module}`
}
