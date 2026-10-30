import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { accessOf, ACCESS_LABEL, countBy, filterRoles, type Access, type EntityId } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { useQueryState } from '../../hooks/useParams'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { ENTITY_OPTIONS } from '../entityStyle'

const CELL: Record<Access, string> = {
  full: 'bg-invert text-on-invert',
  approve: 'bg-accent-strong text-white',
  portal: 'bg-warning-soft text-warning',
  view: 'bg-info-soft text-info-text',
  none: 'bg-raised text-subtle',
}

const KIND = [
  { value: 'internal', label: 'Employees' },
  { value: 'external', label: 'External' },
] as const

export default function UsersPage() {
  const { erp } = useServices()
  const navigate = useNavigate()
  const roles = useResource('erp.roles', () => erp.roles())
  const modules = useResource('erp.modules', () => erp.modules())
  const entities = useResource('erp.entities', () => erp.entities())
  const [query, setQuery] = useQueryState(['entity', 'kind', 'q', 'cols'] as const)
  const entity = query.entity as EntityId | undefined
  const kind = query.kind as 'internal' | 'external' | undefined
  const cols = (query.cols as EntityId | undefined) ?? entity ?? 'holding'

  const all = roles.data ?? []
  const rows = useMemo(() => filterRoles(all, { entity, kind, q: query.q }), [all, entity, kind, query.q])
  const base = filterRoles(all, { entity, q: query.q })
  const columns = (modules.data ?? []).filter((m) => m.entity === cols)
  const seats = rows.reduce((s, r) => s + r.seats, 0)
  const active = Boolean(entity || kind || query.q)
  const clear = () => setQuery({ entity: undefined, kind: undefined, q: undefined })

  if (!roles.data || !modules.data) return <CardSkeleton lines={10} />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(entities.data ?? []).map((e) => {
          const mine = all.filter((r) => r.entity === e.id)
          const on = entity === e.id
          return (
            <button
              key={e.id}
              type="button"
              data-motion="rise"
              aria-pressed={on}
              onClick={() => setQuery({ entity: on ? undefined : e.id, cols: on ? undefined : e.id })}
              className={cn(
                'cursor-pointer rounded-card border p-5 text-left shadow-card transition-[color,background-color,translate,scale] duration-300 active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1',
                on ? 'border-transparent bg-invert text-on-invert' : 'border-line bg-card',
              )}
            >
              <span className="flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full" style={{ background: seriesColor(e.slot) }} />
                <span className={on ? 'opacity-70' : 'text-muted'}>{e.short}</span>
              </span>
              <p className="mt-2 text-[28px] font-medium tracking-tight tabular">{mine.length}</p>
              <p className={cn('text-xs', on ? 'opacity-70' : 'text-muted')}>roles · {count(mine.reduce((s, r) => s + r.seats, 0))} seats</p>
            </button>
          )
        })}
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <FilterChips label="Filter by user type" options={KIND} value={kind} counts={countBy(base, (r) => (r.external ? 'external' : 'internal'))} total={base.length} onChange={(v) => setQuery({ kind: v })} />
          <Input
            className="h-10 w-full sm:w-64"
            icon={<Search className="size-4" />}
            placeholder="Role or department"
            aria-label="Search roles"
            value={query.q ?? ''}
            onChange={(e) => setQuery({ q: e.target.value })}
          />
          {active && (
            <>
              <span className="text-xs text-muted tabular">
                {rows.length} of {all.length} · {count(seats)} seats
              </span>
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear filters
              </Button>
            </>
          )}
          <p className="sr-only" aria-live="polite">
            {rows.length} results
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <Tabs label="Modules shown as columns" options={ENTITY_OPTIONS} value={cols} onChange={(v) => setQuery({ cols: v })} />
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {(['full', 'approve', 'portal', 'view'] as const).map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5">
                <span className={cn('size-3 rounded', CELL[a])} /> {ACCESS_LABEL[a]}
              </span>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No role matches" action={<Button variant="solid" size="sm" onClick={clear}>Clear filters</Button>}>
              Try another word or entity.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <p className="mb-2 text-xs text-muted md:hidden">Swipe sideways to see more modules. The role column stays in place.</p>
            <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-xs font-medium text-muted">Role</th>
                  {columns.map((m) => (
                    <th key={m.id} className="px-1 py-2 text-center">
                      <Link to={`/modules/${m.id}`} title={m.name} className="font-mono text-xs font-semibold hover:text-accent-text hover:underline">
                        {m.code}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-motion="row" onClick={() => navigate(`/users/${r.id}`)} className="group cursor-pointer">
                    <td className="sticky left-0 z-10 max-w-64 bg-card px-2 py-1.5">
                      <Link to={`/users/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium group-hover:underline">
                        {r.name}
                      </Link>
                      <span className="block truncate text-xs text-muted">{r.department}</span>
                    </td>
                    {columns.map((m) => {
                      const a = accessOf(r, m)
                      return (
                        <td key={m.id} className="p-0">
                          <span
                            title={`${r.name} · ${m.code}: ${ACCESS_LABEL[a]}`}
                            className={cn('grid h-9 min-w-12 place-items-center rounded-lg text-[11px] font-semibold transition-transform group-hover:scale-[1.04]', CELL[a])}
                          >
                            {a === 'none' ? '·' : ACCESS_LABEL[a]}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
