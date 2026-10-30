import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowUpRight, Factory, Timer } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { oeeBy, oeeSummary, pareto } from '@/domain/kpi'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { ColumnChart } from '../../charts/ColumnChart'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton, Skeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, refTitle } from '../../records/text'
import { KpiTile } from './KpiTile'

const PlantLine3D = lazy(() => import('../../three/PlantLine3D'))
const VIEWS = [
  { value: 'board', label: 'Dashboard' },
  { value: '3d', label: '3D line' },
] as const

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '28', label: '28 days' },
] as const

const since = (today: string, days: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10)

/** MES production cockpit, ported from the WIT MES: OEE, downtime Pareto, shop-floor order board and quality holds. */
export default function ProductionCockpit() {
  const { clock } = useServices()
  const all = useAllRecords()
  const [win, setWin] = useState<(typeof WINDOWS)[number]['value']>('7')
  const today = clock.today()
  const data = useMemo(() => {
    if (!all.data) return null
    const from = since(today, Number(win))
    const inWin = (r: ErpRecord) => String(r.values.date ?? '') >= from && String(r.values.date ?? '') <= today
    const oee = (all.data['mes.oee'] ?? []).filter(inWin)
    const downtime = (all.data['mes.downtime'] ?? []).filter(inWin)
    const orders = all.data['mes.workorders'] ?? []
    const days = Array.from({ length: Number(win) }, (_, i) => since(today, Number(win) - i))
    return {
      oee,
      summary: oeeSummary(oee),
      daily: days.map((d) => ({ day: d, ...oeeSummary(oee.filter((r) => r.values.date === d)) })),
      byWc: oeeBy(oee, 'workcenter').sort((a, b) => a.oee - b.oee),
      downtime,
      minutes: downtime.reduce((s, r) => s + Number(r.values.minutes ?? 0), 0),
      pareto: pareto(downtime.map((r) => ({ key: String(r.values.reason), value: Number(r.values.minutes ?? 0) }))),
      orders,
      good: orders.filter(inWin).reduce((s, r) => s + Number(r.values.good ?? 0), 0),
      holds: (all.data['mes.holds'] ?? []).filter((r) => r.status !== 'released'),
    }
  }, [all.data, win, today])
  const [day, setDay] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const navigate = useNavigate()

  if (!data || !all.data) return <CardSkeleton lines={8} />
  const oeeType = typeOf('mes.oee')!
  const dtType = typeOf('mes.downtime')!
  const woType = typeOf('mes.workorders')!
  const holdType = typeOf('mes.holds')!
  const board = (['ready', 'running', 'paused', 'completed'] as const).map((s) => ({ s, rows: data.orders.filter((r) => r.status === s) }))
  const picked = data.daily.find((d) => d.day === day)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Factory aria-hidden className="size-4" /> Rodame NPK plant Gresik · Lines A and B
        </p>
        <div className="flex flex-wrap gap-2">
          <Tabs label="View" options={VIEWS} value={view === '3d' ? '3d' : 'board'} onChange={(v) => setParams(v === '3d' ? { view: '3d' } : {}, { replace: true })} />
          <Tabs label="Time window" options={WINDOWS} value={win} onChange={setWin} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiTile label="OEE" value={data.summary.oee} format={(v) => `${v.toFixed(1)}%`} to={recordPath(oeeType)} accent />
        <KpiTile label="Availability" value={data.summary.availability} format={(v) => `${v.toFixed(1)}%`} to={recordPath(oeeType)} />
        <KpiTile label="Performance" value={data.summary.performance} format={(v) => `${v.toFixed(1)}%`} to={recordPath(oeeType)} />
        <KpiTile label="Quality" value={data.summary.quality} format={(v) => `${v.toFixed(1)}%`} to={recordPath(oeeType)} />
        <KpiTile label="Good output" value={data.good} format={(v) => `${count(Math.round(v))} t`} to={recordPath(woType)} />
      </div>

      {view === '3d' && (
        <Card>
          <CardHeader title="Line view" action={<span className="text-xs text-muted">Block height and colour follow OEE · click a block for its records</span>} />
          <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
            <PlantLine3D
              stations={data.byWc.map((w) => ({ id: w.key, name: refTitle('mrp.workcenters', w.key, all.data).split(' · ')[0] ?? w.key, oee: w.oee }))}
              onSelect={(id) => navigate(`${recordPath(oeeType)}?q=${id}`)}
            />
          </Suspense>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="OEE per day" action={<span className="text-xs text-muted">Availability × performance × quality</span>} />
          <ColumnChart
            data={data.daily.map((d) => ({ key: d.day, label: d.day.slice(8), value: Math.round(d.oee * 10) / 10, target: 85 }))}
            selected={day ?? data.daily.at(-1)?.day ?? null}
            onSelect={setDay}
            showTargets
            format={(v) => `${v.toFixed(0)}%`}
            label="OEE per day"
            className="h-60"
          />
          {picked && (
            <p className="mt-3 text-xs text-muted">
              {picked.day}: A {picked.availability.toFixed(1)}% × P {picked.performance.toFixed(1)}% × Q {picked.quality.toFixed(1)}%. The cap marks the 85% world-class target.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title="OEE by work centre" />
          <ul className="space-y-3">
            {data.byWc.map((w) => (
              <li key={w.key}>
                <Link to={`${recordPath(oeeType)}?q=${w.key}`} className="block hover:opacity-80">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{refTitle('mrp.workcenters', w.key, all.data).split(' · ')[0]}</span>
                    <span className={cn('font-medium tabular', w.oee < 65 && 'text-accent-text')}>{w.oee.toFixed(1)}%</span>
                  </span>
                  <Meter value={w.oee / 100} tone={w.oee < 65 ? 'accent' : 'fg'} className="mt-1" label={`OEE ${w.key}`} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Downtime Pareto" icon={<Timer aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted tabular">{count(data.minutes)} min</span>} />
          <ul className="space-y-3">
            {data.pareto.map((p) => (
              <li key={p.key}>
                <Link to={`${recordPath(dtType)}?q=${p.key}`} className="block hover:opacity-80">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{refTitle('mes.reasons', p.key, all.data).split(' · ')[0]}</span>
                    <span className="shrink-0 text-xs text-muted tabular">
                      {p.value} min · {Math.round(p.cumulative * 100)}%
                    </span>
                  </span>
                  <span className="relative mt-1 block h-1.5 rounded-full bg-control">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${p.share * 100}%` }} />
                    <span aria-hidden className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-accent" style={{ left: `${p.cumulative * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Bars show each reason's share; the red tick marks the running total.</p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Shop-floor board" action={<Link to={recordPath(woType)} className="text-xs font-medium text-accent-text hover:underline">All orders</Link>} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {board.map(({ s, rows }) => (
              <div key={s} className="rounded-panel bg-raised p-3">
                <div className="mb-2 flex items-center justify-between">
                  <StateBadge type={woType} status={s} />
                  <Link to={`${recordPath(woType)}?status=${s}`} className="text-xs text-muted tabular hover:underline">
                    {rows.length}
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {rows.slice(0, 4).map((r) => (
                    <li key={r.id}>
                      <Link to={recordPath(woType, r.id)} className="block rounded-xl bg-card p-2.5 text-xs shadow-card hover:bg-hover">
                        <span className="flex justify-between gap-2">
                          <span className="font-mono font-semibold">{r.id}</span>
                          <span className="tabular text-muted">{String(r.values.yield ?? 0)}%</span>
                        </span>
                        <span className="mt-0.5 block truncate text-body">
                          {String(r.values.operation)} · {refTitle('mrp.workcenters', String(r.values.workcenter), all.data).split(' · ')[0]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Active quality holds" action={<Link to={recordPath(holdType)} className="text-xs font-medium text-accent-text hover:underline">Holds worklist</Link>} />
        <ul className="divide-y divide-line">
          {data.holds.map((h) => (
            <li key={h.id} data-motion="row">
              <Link to={recordPath(holdType, h.id)} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:underline">
                <span className="font-mono text-xs font-semibold">{h.id}</span>
                <span className="min-w-0 flex-1 truncate">{refTitle('mes.defects', String(h.values.defect), all.data).split(' · ')[0]}</span>
                <span className="text-xs text-muted tabular">{String(h.values.qty)} t</span>
                <StateBadge type={holdType} status={h.status} />
                <ArrowUpRight aria-hidden className="size-4 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
