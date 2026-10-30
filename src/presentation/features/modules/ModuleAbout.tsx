import { useState } from 'react'
import { Link } from 'react-router'
import { Building, Check, ChevronDown, UserRound } from 'lucide-react'
import { moduleProgress, moduleStatus, SCOPE_LABEL } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { percent } from '@/lib/format'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { StatusPill, Tag } from '../../ui/Badge'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { SCOPE_TONE } from '../entityStyle'
import { useModule } from './context'

export default function ModuleAbout() {
  const { module: m } = useModule()
  const { erp } = useServices()
  const roles = useResource('erp.roles', () => erp.roles())
  const [open, setOpen] = useState<string | null>(null)
  const myRoles = (roles.data ?? []).filter((r) => r.module === m.id)
  const progress = moduleProgress(m)

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <Meter value={progress} tone={moduleStatus(m) === 'live' ? 'success' : 'accent'} className="h-2 flex-1" label="Module rollout progress" />
          <span className="text-2xl font-medium tabular">{percent(progress, { digits: 0 })}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Rollout milestones done across {m.scope.length} scope items</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Scope of work" action={<span className="text-xs text-muted">Click an item for its milestones</span>} />
          <ul className="space-y-2">
            {m.scope.map((item) => {
              const expanded = open === item.id
              return (
                <li key={item.id} data-motion="row" className="rounded-panel bg-raised">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : item.id)}
                    className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="mt-2 flex items-center gap-2">
                        <Meter value={item.done / item.milestones} tone={item.status === 'live' ? 'success' : 'fg'} className="max-w-48 flex-1" label={`${item.title} progress`} />
                        <span className="text-xs text-muted tabular">
                          {item.done}/{item.milestones}
                        </span>
                      </span>
                    </span>
                    <StatusPill tone={SCOPE_TONE[item.status]}>{SCOPE_LABEL[item.status]}</StatusPill>
                    <ChevronDown aria-hidden className={cn('size-4 text-muted transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="animate-rise border-t border-line px-4 pt-3 pb-4">
                      <ol className="flex flex-wrap gap-2">
                        {Array.from({ length: item.milestones }, (_, i) => {
                          const done = i < item.done
                          const current = i === item.done && item.status !== 'plan'
                          return (
                            <li
                              key={i}
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
                                done ? 'bg-invert text-on-invert' : current ? 'bg-accent-soft text-accent-text' : 'bg-control text-muted',
                              )}
                            >
                              {done && <Check aria-hidden className="size-3.5" />}
                              Sprint {i + 1}
                              {current && ' · now'}
                            </li>
                          )
                        })}
                      </ol>
                      <p className="mt-3 text-xs text-muted">
                        Owner: <span className="font-medium text-fg">{item.owner}</span> · Ref <span className="font-mono">{item.id.toUpperCase()}</span>
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Departments" icon={<Building aria-hidden className="size-5 text-muted" />} />
            <div className="flex flex-wrap gap-2">
              {m.departments.map((d) => (
                <Link key={d} to={`/modules?q=${encodeURIComponent(d)}`} className="rounded-full bg-raised px-3 py-1.5 text-xs font-medium hover:bg-control">
                  {d}
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="System users" icon={<UserRound aria-hidden className="size-5 text-muted" />} />
            <ul className="divide-y divide-line">
              {myRoles.map((r) => (
                <li key={r.id} data-motion="row">
                  <Link to={`/users/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.external && <Tag tone="info">External</Tag>}
                    <span className="text-xs text-muted tabular">{r.seats} seats</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
