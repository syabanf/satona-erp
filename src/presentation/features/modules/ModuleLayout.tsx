import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { ArrowRight, ChevronDown, Database, FileText, LayoutDashboard, Lock, Settings2, type LucideIcon } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import { moduleStatus, SCOPE_LABEL } from '@/domain/erp'
import { moduleLabel, recordLabel } from '@/domain/uiLabels'
import { cn } from '@/lib/cn'
import { seriesColor } from '../../charts/colors'
import { useAccess, useApprovals } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StatusPill, Tag } from '../../ui/Badge'
import { buttonStyles } from '../../ui/buttonStyles'
import { Fallback } from '../../ui/Gate'
import { moduleIcon } from '../../ui/moduleIcons'
import { EmptyState } from '../../ui/States'
import { SCOPE_TONE } from '../entityStyle'
import type { ModuleContext } from './context'

const ACCESS_TONE = { approve: 'accent', full: 'success', portal: 'warning', view: 'info', none: 'neutral' } as const
const ACCESS_TEXT = { approve: 'Bisa menyetujui', full: 'Bisa mengelola', portal: 'Akses portal', view: 'Hanya melihat', none: 'Tidak ada akses' } as const

interface Item {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
  waiting?: number
}
interface Group {
  id: string
  title: string
  items: readonly Item[]
  /** Reference data and settings start folded, so daily work is what people see first. */
  folded: boolean
}

const sentence = (s: string) => s.replace(/^\p{Ll}/u, (c) => c.toUpperCase())

function SideLink({ item, onPick }: { item: Item; onPick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onPick}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[15px] transition-colors',
          isActive ? 'bg-accent-soft font-semibold text-accent-text' : 'text-body hover:bg-raised hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="absolute top-2 bottom-2 -left-1 w-1 rounded-r-full bg-accent" />}
          <item.icon aria-hidden className={cn('size-[18px] shrink-0', isActive ? 'text-accent-text' : 'text-subtle')} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.waiting ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-strong px-1.5 text-[11px] font-semibold text-white tabular">
              {item.waiting}
              <span className="sr-only"> menunggu persetujuan</span>
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

/** One section of the side panel; a folded section opens itself when the current page sits inside it. */
function Section({ group, current, onPick }: { group: Group; current?: Item; onPick?: () => void }) {
  const holdsCurrent = group.items.some((i) => i === current)
  const [open, setOpen] = useState(!group.folded || holdsCurrent)
  const shown = open || holdsCurrent
  const waiting = group.items.reduce((s, i) => s + (i.waiting ?? 0), 0)
  return (
    <section aria-labelledby={`side-${group.id}`}>
      <button
        type="button"
        id={`side-${group.id}`}
        aria-expanded={shown}
        onClick={() => setOpen(!shown)}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold tracking-wide text-muted uppercase hover:bg-raised"
      >
        <span className="flex-1">{group.title}</span>
        {!shown && waiting > 0 && <span className="text-accent-text normal-case tabular">{waiting} menunggu</span>}
        <span className="text-[11px] font-normal normal-case tabular">{group.items.length}</span>
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div className="mt-0.5 space-y-0.5 animate-fade">
          {group.items.map((i) => (
            <SideLink key={i.to} item={i} onPick={onPick} />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Module workspace: a one-line module header, a side panel inside the page (daily work first, reference data and
 * settings folded below it, approval counts on each feature), and the chosen page beside it. Phones get one large
 * button that opens the same panel in place.
 */
export default function ModuleLayout() {
  const { id = '' } = useParams()
  const { pathname } = useLocation()
  const { erp } = useServices()
  const { role } = useSession()
  const accessOf = useAccess()
  const approvals = useApprovals()
  const [menuOpen, setMenuOpen] = useState(false)
  const module = useResource(`erp.module:${id}`, () => erp.module(id), { keepPrevious: false })
  const entities = useResource('erp.entities', () => erp.entities())

  const m = module.data
  if (!m) return <Fallback error={module.error} onRetry={module.reload} back={{ to: '/modules', label: 'Back to modules' }} what="module" />
  const access = accessOf(m.id)
  if (access === 'none') {
    return (
      <EmptyState title={`${role.name} has no access to ${m.code}`} action={<Link to="/modules" className={buttonStyles({ variant: 'solid', size: 'sm' })}>Back to modules</Link>}>
        The user matrix keeps this module closed to your role. Switch role from the account menu at the bottom of the sidebar.
      </EmptyState>
    )
  }

  const entity = entities.data?.find((e) => e.id === m.entity)
  const status = moduleStatus(m)
  const types = typesOf(m.id)
  const item = (t: (typeof types)[number], icon: LucideIcon): Item => ({
    to: `/modules/${m.id}/${t.key.split('.')[1]}`,
    label: sentence(recordLabel(t.key, t.name)),
    icon,
    end: false,
    waiting: approvals.filter((a) => a.type.key === t.key).length,
  })
  const home: Item = { to: `/modules/${m.id}`, label: 'Ringkasan modul', icon: LayoutDashboard, end: true }
  const groups: Group[] = [
    { id: 'work', title: 'Pekerjaan harian', items: types.filter((t) => t.area === 'transaction').map((t) => item(t, FileText)), folded: false },
    { id: 'reference', title: 'Data acuan', items: types.filter((t) => t.area === 'master').map((t) => item(t, Database)), folded: true },
    {
      id: 'settings',
      title: 'Pengaturan',
      items: [
        { to: `/modules/${m.id}/config`, label: 'Konfigurasi', icon: Settings2, end: true },
        { to: `/modules/${m.id}/about`, label: 'Cakupan dan pengguna', icon: Settings2, end: true },
      ],
      folded: true,
    },
  ].filter((g) => g.items.length)
  const all = [home, ...groups.flatMap((g) => g.items)]
  // The longest matching link is the page the user is on: a record page sits under its list.
  const current = all.filter((i) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`))).sort((a, b) => b.to.length - a.to.length)[0]
  const Icon = moduleIcon(m.id)

  const panel = (onPick?: () => void): ReactNode => (
    <nav aria-label={`Bagian ${moduleLabel(m.id, m.name)}`} className="space-y-3">
      <SideLink item={home} onPick={onPick} />
      {groups.map((g) => (
        <Section key={g.id} group={g} current={current} onPick={onPick} />
      ))}
    </nav>
  )

  const context: ModuleContext = { module: m, access }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-card">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised">
          <Icon aria-hidden className="size-5 text-fg" />
        </span>
        <div className="min-w-0 flex-1 basis-52">
          <h2 className="truncate text-lg font-semibold">{moduleLabel(m.id, m.name)}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {entity && (
              <Link to={`/entities/${entity.id}`} className="inline-flex items-center gap-1.5 hover:text-fg hover:underline">
                <span className="size-2 rounded-full" style={{ background: seriesColor(entity.slot) }} />
                {entity.short}
              </Link>
            )}
            <Tag tone={ACCESS_TONE[access]}>{ACCESS_TEXT[access]}</Tag>
            {(access === 'view' || access === 'portal') && <Lock aria-label="Akses terbatas" className="size-3" />}
            <StatusPill tone={SCOPE_TONE[status]}>{SCOPE_LABEL[status]}</StatusPill>
          </p>
        </div>
        {m.live && (
          <Link to={m.live.to} className={cn(buttonStyles({ variant: 'soft', size: 'sm' }), 'w-full justify-center sm:w-auto')}>
            {m.live.label} <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-0 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-card border border-line bg-card p-2 shadow-card">{panel()}</div>
        </aside>
        <div className="lg:hidden">
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-card border border-line bg-card px-4 text-left shadow-card"
          >
            {current && <current.icon aria-hidden className="size-5 text-accent-text" />}
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">Bagian</span>
              <span className="block truncate text-base font-semibold">{current?.label ?? 'Pilih bagian'}</span>
            </span>
            <ChevronDown aria-hidden className={cn('size-5 text-muted transition-transform', menuOpen && 'rotate-180')} />
          </button>
          {menuOpen && <div className="mt-2 animate-rise rounded-card border border-line bg-card p-2 shadow-card">{panel(() => setMenuOpen(false))}</div>}
        </div>
        <div className="min-w-0">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  )
}
