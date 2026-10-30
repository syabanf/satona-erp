import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowUpRight, Wrench } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { backlog, pareto, perMonth, pmCompliance, reliability, workMix } from '@/domain/kpi'
import { count, moneyCompact, percent } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { Donut } from '../../charts/Donut'
import { LineChart } from '../../charts/LineChart'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, refTitle } from '../../records/text'
import { KpiTile } from './KpiTile'

const WO_KINDS = ['Preventive', 'Corrective', 'Emergency', 'Inspection', 'Calibration', 'Improvement']

/** Maintenance and reliability cockpit, ported from the WIT CMMS and fed by Rodame's EAM records. */
export default function ReliabilityCockpit() {
  const { clock } = useServices()
  const all = useAllRecords()
  const [slice, setSlice] = useState<string | null>(null)
  const today = clock.today()

  const k = useMemo(() => {
    if (!all.data) return null
    const orders = all.data['eam.workorders'] ?? []
    const assets = all.data['eam.assets'] ?? []
    const failures = orders.filter((r) => r.values.kind === 'Corrective' || r.values.kind === 'Emergency')
    const badActors = pareto(failures.map((r) => ({ key: String(r.values.asset), value: 1 }))).slice(0, 6)
    const downtimeBy = new Map<string, number>()
    for (const r of failures) downtimeBy.set(String(r.values.asset), (downtimeBy.get(String(r.values.asset)) ?? 0) + Number(r.values.downtimeHours ?? 0))
    const techLoad = new Map<string, number>()
    for (const r of orders.filter((o) => ['open', 'assigned', 'progress', 'waiting'].includes(o.status))) techLoad.set(String(r.values.technician), (techLoad.get(String(r.values.technician)) ?? 0) + Math.max(1, Number(r.values.labourHours ?? 0)))
    return {
      rel: reliability(orders, assets.length, today, 90),
      pm: pmCompliance(orders, today, 30),
      backlog: backlog(orders, (all.data['eam.technicians'] ?? []).length),
      mix: workMix(orders),
      modes: pareto(failures.filter((r) => r.values.failure).map((r) => ({ key: String(r.values.failure), value: 1 }))),
      badActors: badActors.map((b) => ({ ...b, downtime: downtimeBy.get(b.key) ?? 0 })),
      cost: WO_KINDS.map((kind, i) => ({ id: kind, label: kind, value: orders.filter((r) => r.values.kind === kind).reduce((s, r) => s + Number(r.values.cost ?? 0), 0), color: seriesColor(i < 5 ? i + 1 : 0) })).filter((c) => c.value > 0),
      techLoad: [...techLoad].sort((a, b) => b[1] - a[1]).slice(0, 6),
      reorder: (all.data['eam.parts'] ?? []).filter((p) => p.values.reorder === 'Yes'),
      rca: (all.data['eam.rca'] ?? []).filter((r) => r.status !== 'closed'),
      requests: (all.data['eam.requests'] ?? []).filter((r) => r.status === 'new').length,
      trend: {
        planned: perMonth(orders.filter((r) => !(r.values.kind === 'Corrective' || r.values.kind === 'Emergency')), today, 6, (r) => String(r.values.due)),
        breakdown: perMonth(failures, today, 6, (r) => String(r.values.due)),
      },
    }
  }, [all.data, today])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const wo = typeOf('eam.workorders')!
  const totalCost = k.cost.reduce((s, c) => s + c.value, 0)
  const short = (type: string, id: string) => refTitle(type, id, all.data).split(' · ')[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="MTBF, 90 days" value={k.rel.mtbf} format={(v) => `${count(Math.round(v))} h`} to={`${recordPath(wo)}?f=Corrective`} accent note={`${k.rel.failures} breakdowns`} />
        <KpiTile label="MTTR" value={k.rel.mttr} format={(v) => `${v.toFixed(1)} h`} to={`${recordPath(wo)}?f=Corrective`} note="hands-on repair time" />
        <KpiTile label="PM compliance, 30 days" value={k.pm.rate * 100} format={(v) => `${Math.round(v)}%`} to={`${recordPath(wo)}?f=Preventive`} note={`${k.pm.done} of ${k.pm.due} done`} />
        <KpiTile label="Backlog" value={k.backlog.weeks} format={(v) => `${v.toFixed(1)} wk`} to={`${recordPath(wo)}?status=open`} note={`${k.backlog.open} orders, ${count(Math.round(k.backlog.hours))} h`} />
        <KpiTile label="Breakdown downtime" value={k.rel.downtime} format={(v) => `${count(Math.round(v))} h`} to={`${recordPath(wo)}?f=Emergency`} note="last 90 days" />
        <KpiTile label="New requests" value={k.requests} format={(v) => String(Math.round(v))} to={`${recordPath(typeOf('eam.requests')!)}?status=new`} note="waiting for triage" />
      </div>

      <Card>
        <CardHeader title="Planned and breakdown work, 6 months" action={<span className="text-xs text-muted">work orders by due month</span>} />
        <LineChart
          labels={k.trend.planned.map((m) => new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))}
          series={[
            { id: 'planned', label: 'Planned', values: k.trend.planned.map((m) => m.count), color: 'var(--color-series-2)', area: true },
            { id: 'breakdown', label: 'Breakdowns', values: k.trend.breakdown.map((m) => m.count), color: 'var(--color-series-1)' },
          ]}
          format={(v) => `${v} orders`}
          height={220}
          label="Planned and breakdown work orders per month"
        />
        <p className="mt-2 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-2" /> Preventive, inspection, calibration</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-1" /> Corrective and emergency</span>
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Failure modes" icon={<AlertTriangle aria-hidden className="size-5 text-muted" />} />
          <ul className="space-y-3">
            {k.modes.slice(0, 7).map((m) => (
              <li key={m.key}>
                <Link to={recordPath(typeOf('eam.failurecodes')!, m.key)} className="block hover:opacity-80">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{short('eam.failurecodes', m.key)}</span>
                    <span className="shrink-0 text-xs text-muted tabular">
                      {m.value} · {Math.round(m.cumulative * 100)}%
                    </span>
                  </span>
                  <span className="relative mt-1 block h-1.5 rounded-full bg-control">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${m.share * 100}%` }} />
                    <span aria-hidden className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-accent" style={{ left: `${m.cumulative * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Bad actors" />
          <ul className="divide-y divide-line">
            {k.badActors.map((b, i) => (
              <li key={b.key} data-motion="row">
                <Link to={recordPath(typeOf('eam.assets')!, b.key)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{short('eam.assets', b.key)}</span>
                  <span className="text-xs text-muted tabular">
                    {b.value} failures · {b.downtime} h
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Maintenance cost by type" />
          <div className="flex flex-col items-center gap-3">
            <Donut slices={k.cost} active={slice} onActive={setSlice} size={170} stroke={20} chip={(s) => `${s.label}, ${moneyCompact(s.value)}`} label="Maintenance cost by work type">
              <p className="text-xs text-muted">Total</p>
              <p className="text-sm font-semibold tabular">{moneyCompact(totalCost)}</p>
            </Donut>
            <div className="w-full">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">Planned work share</span>
                <span className="font-medium tabular">{percent(k.mix.plannedShare, { digits: 0 })}</span>
              </div>
              <Meter value={k.mix.plannedShare} tone={k.mix.plannedShare >= 0.8 ? 'success' : 'accent'} label="Planned work share" />
              <p className="mt-1 text-xs text-muted">Best practice keeps planned work above 80%.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Technician load" icon={<Wrench aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">open hours</span>} />
          <ul className="space-y-3">
            {k.techLoad.map(([id, hours]) => (
              <li key={id}>
                <Link to={recordPath(typeOf('eam.technicians')!, id)} className="block hover:opacity-80">
                  <span className="flex justify-between text-sm">
                    <span className="truncate">{short('eam.technicians', id)}</span>
                    <span className="text-xs text-muted tabular">{hours} h</span>
                  </span>
                  <Meter value={hours / 40} tone={hours > 32 ? 'accent' : 'fg'} className="mt-1" label={`Load ${id}`} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Spare parts to reorder" />
          {k.reorder.length === 0 ? (
            <p className="text-sm text-muted">Every part is above its minimum stock.</p>
          ) : (
            <ul className="divide-y divide-line">
              {k.reorder.slice(0, 8).map((p) => (
                <li key={p.id} data-motion="row">
                  <Link to={recordPath(typeOf('eam.parts')!, p.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                    <span className="min-w-0 flex-1 truncate">{String(p.values.name)}</span>
                    <span className="text-xs text-accent-text tabular">
                      {String(p.values.onHand)} / min {String(p.values.minStock)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Open root cause analyses" />
          <ul className="divide-y divide-line">
            {k.rca.map((r) => (
              <li key={r.id} data-motion="row">
                <Link to={recordPath(typeOf('eam.rca')!, r.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                  <span className="min-w-0 flex-1 truncate">{String(r.values.title)}</span>
                  <StateBadge type={typeOf('eam.rca')!} status={r.status} />
                  <ArrowUpRight aria-hidden className="size-4 shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
