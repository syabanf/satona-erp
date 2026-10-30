import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Network } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { dueWithin } from '@/domain/kpi'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count, moneyCompact, monthLabel, percent } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { Donut } from '../../charts/Donut'
import { LineChart } from '../../charts/LineChart'
import { recordPath, refTitle } from '../../records/text'
import { useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { BarList } from '../../ui/BarList'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'
import { NewButtons } from '../../records/NewButtons'
import { RecordControls } from '../../records/RecordControls'

const t = (key: string) => typeOf(key)!

/** One org unit row with its staff count; expands to the units that report to it. */
function OrgNode({ unit, units, staff, depth = 0 }: { unit: ErpRecord; units: readonly ErpRecord[]; staff: Map<string, number>; depth?: number }) {
  const kids = units.filter((u) => u.values.parentUnit === unit.id)
  const [open, setOpen] = useState(depth < 1)
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={false}>
      <div className="flex items-center gap-1.5 py-1">
        {kids.length ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`${open ? 'Collapse' : 'Expand'} ${String(unit.values.name)}`} className="grid size-6 cursor-pointer place-items-center rounded-md hover:bg-raised">
            <ChevronRight aria-hidden className={cn('size-3.5 text-subtle transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-6" />
        )}
        <Link to={recordPath(t('hrs.orgunits'), unit.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-raised">
          <span className="truncate font-medium">{String(unit.values.name)}</span>
          <span className="text-xs text-subtle">{String(unit.values.level)}</span>
          <span className="ml-auto shrink-0 text-xs text-muted tabular">{staff.get(unit.id) ?? 0} staff</span>
        </Link>
      </div>
      {open && kids.length > 0 && (
        <ul role="group" className="ml-3 border-l border-line pl-2">
          {kids.map((k) => (
            <OrgNode key={k.id} unit={k} units={units} staff={staff} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Human capital cockpit, carried over from the Habitat HRIS dashboard and fed by the HRS records. */
export default function HrCockpit() {
  const navigate = useNavigate()
  const { clock, erp } = useServices()
  const all = useAllRecords()
  const entities = useResource('erp.entities', () => erp.entities())
  const [slice, setSlice] = useState<string | null>(null)
  const today = clock.today()

  const k = useMemo(() => {
    if (!all.data || !entities.data) return null
    const d = all.data
    const attendance = (d['hrs.attendance'] ?? []).filter((a) => a.values.date === today)
    const present = attendance.filter((a) => a.values.result === 'On time' || a.values.result === 'Late').length
    const payroll = d['hrs.payroll'] ?? []
    const periods = [...new Set(payroll.map((p) => String(p.values.period)))].sort().slice(-6)
    const candidates = d['hrs.candidates'] ?? []
    const thisMonth = today.slice(0, 7)
    const k3 = (d['hrs.trainings'] ?? []).filter((x) => /Chemical|Emergency|Confined|height|LOTO/.test(String(x.values.course)))
    // Staff per unit includes everyone in the units below it.
    const units = d['hrs.orgunits'] ?? []
    const own = new Map<string, number>()
    for (const e of d['mdm.employees'] ?? []) own.set(String(e.values.orgunit), (own.get(String(e.values.orgunit)) ?? 0) + 1)
    const staff = new Map<string, number>()
    const total = (id: string): number => {
      const sum = (own.get(id) ?? 0) + units.filter((u) => u.values.parentUnit === id).reduce((s, u) => s + total(u.id), 0)
      staff.set(id, sum)
      return sum
    }
    units.filter((u) => !u.values.parentUnit).forEach((u) => total(u.id))
    return {
      headcount: entities.data.map((e) => ({ id: e.id, label: e.short, value: e.headcount, color: seriesColor(e.slot) })),
      attendance: { rate: attendance.length ? present / attendance.length : 0, late: attendance.filter((a) => a.values.result === 'Late').length, absent: attendance.filter((a) => a.values.result === 'Absent').length, total: attendance.length },
      leaveWaiting: (d['hrs.leaves'] ?? []).filter((l) => l.status === 'submitted').length,
      overtime: (d['hrs.overtime'] ?? []).filter((o) => String(o.values.date).startsWith(thisMonth)).reduce((s, o) => s + Number(o.values.hours), 0),
      payroll: periods.map((p) => ({ period: p, gross: payroll.filter((x) => x.values.period === p).reduce((s, x) => s + Number(x.values.gross), 0) })),
      funnel: t('hrs.candidates').workflow.states.map((s) => ({ key: s.id, label: s.label, value: candidates.filter((c) => c.status === s.id).length })),
      contracts: dueWithin((d['hrs.contracts'] ?? []).filter((c) => c.status !== 'ended' && c.values.end), 'end', today, 60),
      k3: k3.length ? k3.filter((x) => x.status === 'done').length / k3.length : 0,
      units,
      staff,
    }
  }, [all.data, entities.data, today])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const list = (key: string, query = '') => `${recordPath(t(key))}${query}`
  const totalHeadcount = k.headcount.reduce((s, h) => s + h.value, 0)
  const root = k.units.find((u) => !u.values.parentUnit)

  return (
    <div className="space-y-4">
      <NewButtons types={['hrs.leaves', 'hrs.overtime', 'hrs.attendance', 'hrs.candidates', 'hrs.trainings']} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Attendance today" value={k.attendance.rate * 100} format={(v) => `${Math.round(v)}%`} to={list('hrs.attendance', '?status=recorded')} accent note={`${k.attendance.total} clock-ins recorded`} />
        <KpiTile label="Late today" value={k.attendance.late} format={(v) => String(Math.round(v))} to={list('hrs.attendance', '?f=Late')} note={`${k.attendance.absent} absent`} />
        <KpiTile label="Leave waiting" value={k.leaveWaiting} format={(v) => String(Math.round(v))} to={list('hrs.leaves', '?status=submitted')} note="multilevel approval" />
        <KpiTile label="Overtime this month" value={k.overtime} format={(v) => `${count(Math.round(v))} h`} to={list('hrs.overtime')} note="approved and pending" />
        <KpiTile label="Contracts ending, 60 days" value={k.contracts.length} format={(v) => String(Math.round(v))} to={list('hrs.contracts', '?status=renewal')} note="PKWT and outsourced" />
        <KpiTile label="K3 training completed" value={k.k3 * 100} format={(v) => `${Math.round(v)}%`} to={list('hrs.trainings')} note="GHS, LOTO, confined space" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Gross payroll, 6 months" action={<span className="text-xs text-muted">all entities</span>} />
          <LineChart
            labels={k.payroll.map((p) => monthLabel(p.period))}
            series={[{ id: 'gross', label: 'Gross pay', values: k.payroll.map((p) => p.gross), color: 'var(--color-series-1)', area: true }]}
            format={(v) => moneyCompact(v)}
            height={220}
            onPick={(i) => navigate(list('hrs.payroll', `?q=${k.payroll[i]?.period ?? ''}`))}
            label="Gross payroll per month"
          />
        </Card>
        <Card>
          <CardHeader title="Headcount by entity" />
          <div className="flex flex-col items-center gap-3">
            <Donut slices={k.headcount} active={slice} onActive={setSlice} size={170} stroke={20} chip={(s) => `${s.label}, ${count(s.value)} (${percent(s.value / totalHeadcount, { digits: 0 })})`} onPick={(id) => navigate(list('mdm.employees', `?f=${id}`))} label="Headcount by entity">
              <p className="text-xs text-muted">People</p>
              <p className="text-lg font-semibold tabular">{count(totalHeadcount)}</p>
            </Donut>
            <BarList items={k.headcount.map((h) => ({ key: h.id, label: h.label, value: h.value, text: count(h.value), to: list('mdm.employees', `?f=${h.id}`) }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Organisation" icon={<Network aria-hidden className="size-5 text-muted" />} />
          {root ? (
            <ul role="tree" aria-label="Organisation chart">
              <OrgNode unit={root} units={k.units} staff={k.staff} />
            </ul>
          ) : (
            <p className="text-sm text-muted">No organisation units yet.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Recruitment funnel" />
          <BarList items={k.funnel.map((f) => ({ key: f.key, label: f.label, value: f.value, alert: f.key === 'offer', to: list('hrs.candidates', `?status=${f.key}`) }))} />
        </Card>
        <Card>
          <CardHeader title="Contracts ending soon" />
          <ul className="divide-y divide-line">
            {k.contracts.slice(0, 7).map((c) => (
              <li key={c.id} data-motion="row">
                <Link to={recordPath(t('hrs.contracts'), c.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{refTitle('mdm.employees', String(c.values.employee), all.data).split(' · ')[0]}</span>
                    <span className="block truncate text-xs text-muted">{String(c.values.kind)}</span>
                  </span>
                  <span className={cn('text-xs tabular', String(c.values.end) < today ? 'font-semibold text-accent-text' : 'text-muted')}>{String(c.values.end)}</span>
                </Link>
                <RecordControls type={t('hrs.contracts')} record={c} className="pb-2.5" />
              </li>
            ))}
            {k.contracts.length === 0 && <li className="py-2 text-sm text-muted">No contract ends in the next 60 days.</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
