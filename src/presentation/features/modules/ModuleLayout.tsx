import { Link, NavLink, Outlet, useParams } from 'react-router'
import { ArrowRight, Lock } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import { ACCESS_LABEL, moduleStatus, SCOPE_LABEL } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { seriesColor } from '../../charts/colors'
import { useAccess } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StatusPill, Tag } from '../../ui/Badge'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card } from '../../ui/Card'
import { Fallback } from '../../ui/Gate'
import { Headline } from '../../ui/Headline'
import { EmptyState } from '../../ui/States'
import { SCOPE_TONE } from '../entityStyle'
import type { ModuleContext } from './context'

const ACCESS_TONE = { approve: 'accent', full: 'success', portal: 'warning', view: 'info', none: 'neutral' } as const

/** Module workspace: the module header, a tab per record type, and the selected tab below. */
export default function ModuleLayout() {
  const { id = '' } = useParams()
  const { erp } = useServices()
  const { role } = useSession()
  const accessOf = useAccess()
  const module = useResource(`erp.module:${id}`, () => erp.module(id), { keepPrevious: false })
  const entities = useResource('erp.entities', () => erp.entities())

  const m = module.data
  if (!m) return <Fallback error={module.error} onRetry={module.reload} back={{ to: '/modules', label: 'Back to modules' }} what="module" />
  const access = accessOf(m.id)
  const entity = entities.data?.find((e) => e.id === m.entity)
  const status = moduleStatus(m)
  const tab = (t: (typeof types)[number]) => ({ to: `/modules/${m.id}/${t.key.split('.')[1]}`, label: t.name, end: false })
  const types = typesOf(m.id)
  const groups = [
    { label: '', tabs: [{ to: `/modules/${m.id}`, label: 'Insight', end: true }] },
    { label: 'Master data', tabs: types.filter((t) => t.area === 'master').map(tab) },
    { label: 'Transactions', tabs: types.filter((t) => t.area === 'transaction').map(tab) },
    { label: 'Setup', tabs: [{ to: `/modules/${m.id}/config`, label: 'Configuration', end: true }, { to: `/modules/${m.id}/about`, label: 'Scope & users', end: true }] },
  ].filter((g) => g.tabs.length)

  if (access === 'none') {
    return (
      <EmptyState title={`${role.name} has no access to ${m.code}`} action={<Link to="/modules" className={buttonStyles({ variant: 'solid', size: 'sm' })}>Back to modules</Link>}>
        The user matrix keeps this module closed to your role. Switch role from the account menu at the bottom of the sidebar.
      </EmptyState>
    )
  }

  const context: ModuleContext = { module: m, access }
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-raised px-2 py-1 font-mono text-xs font-semibold">{m.code}</span>
              <StatusPill tone={SCOPE_TONE[status]}>{SCOPE_LABEL[status]}</StatusPill>
              {entity && (
                <Link to={`/entities/${entity.id}`} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg hover:underline">
                  <span className="size-2 rounded-full" style={{ background: seriesColor(entity.slot) }} />
                  {entity.name}
                </Link>
              )}
            </div>
            <Headline className="mt-2">{m.name}</Headline>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              Signed in as <span className="font-medium text-fg">{role.name}</span>
              <Tag tone={ACCESS_TONE[access]}>{ACCESS_LABEL[access]}</Tag>
              {(access === 'view' || access === 'portal') && (
                <span className="inline-flex items-center gap-1">
                  <Lock aria-hidden className="size-3" /> {access === 'view' ? 'read only' : 'workflow steps only'}
                </span>
              )}
            </p>
          </div>
          {m.live && (
            <Link to={m.live.to} className={buttonStyles({ variant: 'soft', size: 'sm' })}>
              {m.live.label} <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </div>
        <nav aria-label={`${m.code} sections`} className="no-scrollbar -mx-5 mt-5 -mb-5 flex gap-7 overflow-x-auto border-t border-line px-5">
          {groups.map((g) => (
            <div key={g.label || 'home'} className="flex shrink-0 items-center gap-5">
              {g.label && <span className="eyebrow">{g.label}</span>}
              {g.tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn('shrink-0 border-b-2 py-3 text-sm whitespace-nowrap transition-colors', isActive ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </Card>
      <Outlet context={context} />
    </div>
  )
}
