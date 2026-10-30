import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { countBy, filterModules, moduleProgress, moduleStatus, SCOPE_LABEL, type EntityId, type ScopeStatus } from '@/domain/erp'
import { moduleLabel } from '@/domain/uiLabels'
import { percent } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { useQueryState } from '../../hooks/useParams'
import { useAccess } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { StatusPill } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Input, Select } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { Meter } from '../../ui/Meter'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { ENTITY_OPTIONS, SCOPE_TONE } from '../entityStyle'

const STATUS_OPTIONS: ReadonlyArray<{ value: ScopeStatus; label: string }> = [
  { value: 'live', label: SCOPE_LABEL.live },
  { value: 'build', label: SCOPE_LABEL.build },
  { value: 'plan', label: SCOPE_LABEL.plan },
]

export default function ModulesPage() {
  const { erp } = useServices()
  const navigate = useNavigate()
  const modules = useResource('erp.modules', () => erp.modules())
  const entities = useResource('erp.entities', () => erp.entities())
  const [query, setQuery] = useQueryState(['entity', 'status', 'q'] as const)
  const entity = query.entity as EntityId | undefined
  const status = query.status as ScopeStatus | undefined

  const accessFor = useAccess()
  const all = useMemo(() => (modules.data ?? []).filter((m) => accessFor(m.id) !== 'none'), [modules.data, accessFor])
  const rows = useMemo(() => filterModules(all, { entity, status, q: query.q }), [all, entity, status, query.q])
  const statusCounts = countBy(filterModules(all, { entity, q: query.q }), moduleStatus)
  const base = filterModules(all, { entity, q: query.q }).length
  const active = Boolean(entity || status || query.q)
  const entityOf = (id: EntityId) => entities.data?.find((e) => e.id === id)

  if (!modules.data) return <CardSkeleton lines={8} />

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <FilterChips label="Saring menurut status" options={STATUS_OPTIONS} value={status} counts={statusCounts} total={base} onChange={(v) => setQuery({ status: v })} />
        <Select
          compact
          aria-label="Saring menurut perusahaan"
          value={entity ?? ''}
          onChange={(e) => setQuery({ entity: e.target.value || undefined })}
          options={[{ value: '', label: 'Semua perusahaan' }, ...ENTITY_OPTIONS]}
        />
        <Input
          className="h-10 w-full sm:w-64"
          icon={<Search className="size-4" />}
          placeholder="Cari nama modul atau pekerjaan"
          aria-label="Cari modul"
          value={query.q ?? ''}
          onChange={(e) => setQuery({ q: e.target.value })}
        />
        {active && (
          <>
            <span className="text-xs text-muted tabular">
              {rows.length} dari {all.length}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setQuery({ entity: undefined, status: undefined, q: undefined })}>
              Hapus saringan
            </Button>
          </>
        )}
        <p className="sr-only" aria-live="polite">
          {rows.length} hasil
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Modul tidak ditemukan"
            action={
              <Button variant="solid" size="sm" onClick={() => setQuery({ entity: undefined, status: undefined, q: undefined })}>
                Hapus saringan
              </Button>
            }
          >
            Coba kata lain atau tampilkan semua perusahaan.
          </EmptyState>
        </div>
      ) : (
        <>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Modul</th>
                <th className="px-3 py-3 font-medium">Perusahaan</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="w-48 px-3 py-3 font-medium">Kemajuan</th>
                <th className="px-5 py-3 text-right font-medium">Pengguna</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => {
                const s = moduleStatus(m)
                const e = entityOf(m.entity)
                return (
                  <tr key={m.id} data-motion="row" onClick={() => navigate(`/modules/${m.id}`)} className="cursor-pointer transition-colors hover:bg-raised">
                    <td className="px-5 py-3.5">
                      <Link to={`/modules/${m.id}`} className="flex items-center gap-3" onClick={(ev) => ev.stopPropagation()}>
                        <span className="grid h-8 w-12 shrink-0 place-items-center rounded-lg bg-raised font-mono text-[11px] font-semibold">{m.code}</span>
                        <span className="font-medium">{moduleLabel(m.id, m.name)}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center gap-2 text-body">
                        <span className="size-2 rounded-full" style={{ background: seriesColor(e?.slot ?? 0) }} />
                        {e?.short}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusPill tone={SCOPE_TONE[s]}>{SCOPE_LABEL[s]}</StatusPill>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <Meter value={moduleProgress(m)} tone={s === 'live' ? 'success' : 'fg'} className="flex-1" label={`Kemajuan ${moduleLabel(m.id, m.name)}`} />
                        <span className="w-9 text-right text-xs tabular">{percent(moduleProgress(m), { digits: 0 })}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular text-body">{m.users.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((m) => {
              const s = moduleStatus(m)
              return (
                <li key={m.id} data-motion="row">
                  <Link to={`/modules/${m.id}`} className="block p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">{m.code}</span>
                      <StatusPill tone={SCOPE_TONE[s]}>{SCOPE_LABEL[s]}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{moduleLabel(m.id, m.name)}</p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}
