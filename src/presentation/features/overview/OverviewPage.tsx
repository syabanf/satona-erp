import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, ArrowUpRight, MapPinned, Siren } from 'lucide-react'
import { RECORD_TYPES } from '@/domain/catalog'
import { moduleProgress, moduleStatus, type EntityId } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { count, moneyCompact, percent } from '@/lib/format'
import { ColumnChart } from '../../charts/ColumnChart'
import { seriesColor } from '../../charts/colors'
import { Donut } from '../../charts/Donut'
import { useAlerts } from '../../hooks/useAlerts'
import { useQueryState } from '../../hooks/useParams'
import { useAllRecords, useApprovals } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { BaseMap } from '../../maps/BaseMap'
import { SiteMarkers } from '../../maps/SiteMarkers'
import { Delta, Dot } from '../../ui/Badge'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CountUp } from '../../ui/Motion'
import { POP } from '../../ui/pop'
import { Skeleton } from '../../ui/States'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, recordTitle } from '../../records/text'
import { ENTITY_ICON, ENTITY_POP, monthLabels } from '../entityStyle'

const tile =
  'block rounded-card border border-line bg-card p-5 shadow-card transition-[color,background-color,translate,scale] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1'

export default function OverviewPage() {
  const navigate = useNavigate()
  const { erp, ops, clock } = useServices()
  const entities = useResource('erp.entities', () => erp.entities())
  const modules = useResource('erp.modules', () => erp.modules())
  const sites = useResource('ops.sites', () => ops.sites())
  const trucks = useResource('ops.trucks', () => ops.trucks())
  const alerts = { data: useAlerts() }
  const approvals = useApprovals()
  const all = useAllRecords()
  const [{ site, hide }, setQuery] = useQueryState(['site', 'hide'] as const)
  const labels = monthLabels(clock.today())
  const [month, setMonth] = useState(String(labels.length - 1))
  const [slice, setSlice] = useState<string | null>(null)

  const hidden = new Set((hide ?? '').split(',').filter(Boolean))
  const list = entities.data ?? []
  const totals = useMemo(() => labels.map((_, i) => list.reduce((s, e) => s + (e.revenue[i] ?? 0), 0)), [list, labels])
  const ytd = list.reduce((s, e) => s + e.revenueYtd, 0)
  const live = (modules.data ?? []).filter((m) => moduleStatus(m) === 'live').length
  const rollout = modules.data ? modules.data.reduce((s, m) => s + moduleProgress(m), 0) / modules.data.length : 0
  const onRoad = (trucks.data ?? []).filter((t) => t.state !== 'loading').length
  const picked = (sites.data ?? []).find((s) => s.id === site)
  const shown = (sites.data ?? []).filter((s) => !hidden.has(s.entity))
  const m = Number(month)
  const latest = RECORD_TYPES.flatMap((type) => (all.data?.[type.key] ?? []).map((record) => ({ type, record })))
    .sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))
    .slice(0, 8)
  const monthTotal = totals[m] ?? 0

  function toggleEntity(id: EntityId) {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setQuery({ hide: [...next].join(','), site: picked && next.has(picked.entity) ? undefined : site })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Link to="/entities/holding" data-motion="rise" className={tile}>
          <p className="text-xs text-muted">Group revenue, year to date</p>
          <p className="mt-2 text-[28px] font-medium tracking-tight tabular">{entities.data ? <CountUp value={ytd} format={moneyCompact} /> : '·'}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Delta value={0.087} /> against last year
          </p>
        </Link>
        <Link to="/fleet" data-motion="rise" className={tile}>
          <p className="text-xs text-muted">Tankers on the road</p>
          <p className="mt-2 text-[28px] font-medium tracking-tight tabular">{trucks.data ? <CountUp value={onRoad} /> : '·'}</p>
          <p className="mt-1 text-xs text-muted">of {trucks.data?.length ?? '·'} tracked by GPS</p>
        </Link>
        <Link to="/modules" data-motion="rise" className={tile}>
          <p className="text-xs text-muted">ERP rollout</p>
          <p className="mt-2 text-[28px] font-medium tracking-tight tabular">
            {modules.data ? <CountUp value={rollout * 100} format={(v: number) => `${Math.round(v)}%`} /> : '·'}
          </p>
          <Meter value={rollout} tone="accent" className="mt-2" label="ERP rollout progress" />
        </Link>
        <Link to="/approvals" data-motion="rise" className={tile}>
          <p className="text-xs text-muted">Waiting for your approval</p>
          <p className="mt-2 text-[28px] font-medium tracking-tight tabular">{all.data ? <CountUp value={approvals.length} /> : '·'}</p>
          <p className="mt-1 text-xs text-muted">
            {live} of {modules.data?.length ?? 18} modules fully live
          </p>
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Group footprint"
            icon={<MapPinned aria-hidden className="size-5 text-muted" />}
            action={
              <div role="group" aria-label="Show entities on the map" className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {list.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={!hidden.has(e.id)}
                    onClick={() => toggleEntity(e.id)}
                    className={cn(
                      'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-medium transition-colors',
                      hidden.has(e.id) ? 'bg-transparent text-subtle line-through' : 'bg-raised text-fg hover:bg-control',
                    )}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: seriesColor(e.slot) }} />
                    {e.short}
                  </button>
                ))}
              </div>
            }
          />
          <div className="relative">
            {sites.data && entities.data ? (
              <BaseMap
                center={[-5.6, 109.5]}
                zoom={6}
                focus={picked ? { at: picked.at, zoom: 8 } : { at: [-5.6, 109.5], zoom: 6 }}
                className="h-[360px] sm:h-[420px]"
                label="Map of Satona sites"
              >
                <SiteMarkers sites={shown} entities={list} selected={site} onSelect={(id) => setQuery({ site: id === site ? undefined : id })} />
              </BaseMap>
            ) : (
              <Skeleton className="h-[360px] rounded-panel sm:h-[420px]" />
            )}
            {picked && (
              <div className="absolute bottom-3 left-3 z-[500] w-[min(320px,calc(100%-24px))] animate-rise rounded-panel border border-line bg-card p-4 shadow-float">
                <p className="text-xs text-muted">
                  {picked.city} · {picked.kind.replace('-', ' ')}
                </p>
                <p className="mt-0.5 font-semibold">{picked.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-raised p-2">
                    <p className="text-muted">Staff</p>
                    <p className="text-sm font-semibold tabular">{count(picked.staff)}</p>
                  </div>
                  <div className="rounded-xl bg-raised p-2">
                    <p className="text-muted">Utilisation</p>
                    <p className="text-sm font-semibold tabular">{percent(picked.utilisation, { digits: 0 })}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link to={`/entities/${picked.entity}`} className={buttonStyles({ variant: 'solid', size: 'sm' })}>
                    Open entity <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                  <button type="button" onClick={() => setQuery({ site: undefined })} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">Click a site to drill in. Toggle an entity above to hide its sites.</p>
        </Card>

        <Card>
          <CardHeader title="Needs attention" icon={<Siren aria-hidden className="size-5 text-muted" />} />
          <ul className="divide-y divide-line">
            {(alerts.data ?? []).map((a) => (
              <li key={a.id} data-motion="row">
                <Link to={a.to} className="group flex items-start gap-3 py-3 first:pt-0">
                  <Dot tone={a.tone === 'danger' ? 'accent' : a.tone} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium group-hover:underline">{a.title}</span>
                    <span className="block text-xs text-muted">{a.detail}</span>
                  </span>
                  <ArrowUpRight aria-hidden className="size-4 shrink-0 text-subtle group-hover:text-fg" />
                </Link>
              </li>
            ))}
            {!alerts.data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="my-3 h-10" />)}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Consolidated revenue" action={<span className="text-xs text-muted">Last 12 months, Rp miliar (M)</span>} />
          {entities.data ? (
            <ColumnChart
              data={totals.map((v, i) => ({ key: String(i), label: labels[i] ?? '', value: Math.round(v / 1e8) / 10 }))}
              selected={month}
              onSelect={setMonth}
              format={(v) => `${v.toFixed(0)} M`}
              badge={(_, i) => {
                const prev = totals[i - 1]
                return prev ? percent(((totals[i] ?? 0) - prev) / prev, { signed: true, digits: 0 }) : 'First'
              }}
              label="Consolidated revenue by month"
              className="h-64"
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </Card>

        <Card>
          <CardHeader title={`${labels[m] ?? ''} by entity`} />
          {entities.data && (
            <div className="flex flex-col items-center gap-4">
              <Donut
                slices={list.map((e) => ({ id: e.id, label: e.short, value: e.revenue[m] ?? 0, color: seriesColor(e.slot) }))}
                active={slice}
                onActive={setSlice}
                chip={(s) => `${s.label}, ${percent(s.value / (monthTotal || 1), { digits: 0 })}`}
                onPick={(id) => navigate(`/entities/${id}`)}
                label={`Revenue by entity in ${labels[m]}`}
              >
                <p className="text-xs text-muted">Total</p>
                <p className="text-lg font-semibold tabular">{moneyCompact(monthTotal)}</p>
              </Donut>
              <ul className="w-full space-y-1">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/entities/${e.id}`}
                      onMouseEnter={() => setSlice(e.id)}
                      onMouseLeave={() => setSlice(null)}
                      onFocus={() => setSlice(e.id)}
                      onBlur={() => setSlice(null)}
                      className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-raised', slice === e.id && 'bg-raised')}
                    >
                      <span className="size-2.5 rounded-full" style={{ background: seriesColor(e.slot) }} />
                      <span className="flex-1">{e.short}</span>
                      <span className="font-medium tabular">{moneyCompact(e.revenue[m] ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((e) => {
          const Icon = ENTITY_ICON[e.id]
          const mods = (modules.data ?? []).filter((x) => x.entity === e.id)
          const progress = mods.length ? mods.reduce((s, x) => s + moduleProgress(x), 0) / mods.length : 0
          return (
            <Link key={e.id} to={`/entities/${e.id}`} data-motion="rise" className={cn(tile, 'border-0', POP[ENTITY_POP[e.id]])}>
              <div className="flex items-center justify-between">
                <Icon aria-hidden className="size-6" />
                <ArrowUpRight aria-hidden className="size-5 opacity-60" />
              </div>
              <p className="mt-6 text-xs opacity-70">{e.sector}</p>
              <p className="text-lg font-semibold">{e.short}</p>
              <p className="mt-3 text-sm tabular opacity-80">
                {mods.length} modules · {Math.round(progress * 100)}% rolled out
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-current/15">
                <div className="h-full rounded-full bg-current transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
              </div>
            </Link>
          )
        })}
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
          <h2 className="text-lg font-semibold">Latest ERP changes</h2>
          <Link to="/integration" className={buttonStyles({ variant: 'soft', size: 'sm' })}>
            Event bus
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {latest.map(({ type, record }) => (
            <li key={`${type.key}-${record.id}`} data-motion="row">
              <Link to={recordPath(type, record.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-raised">
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold">{type.module.toUpperCase()}</span>
                <span className="font-mono text-xs">{record.id}</span>
                <span className="min-w-0 flex-1 truncate">{recordTitle(type, record, all.data)}</span>
                <StateBadge type={type} status={record.status} />
                <span className="w-24 text-right text-xs text-muted">{record.history.at(-1)?.action}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
