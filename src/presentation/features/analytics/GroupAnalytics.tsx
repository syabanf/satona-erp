import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { typeOf } from '@/domain/catalog'
import { shiftDay } from '@/domain/kpi'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { moneyCompact, monthLabel } from '@/lib/format'
import { LineChart } from '../../charts/LineChart'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { monthQuery, recordPath, refTitle } from '../../records/text'
import { BarList } from '../../ui/BarList'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'

const t = (key: string) => typeOf(key)!
const sum = (rows: readonly ErpRecord[], field: string) => rows.reduce((s, r) => s + Number(r.values[field] ?? 0), 0)
const LEVELS = [5, 4, 3, 2, 1]
/** Heat of a likelihood × impact cell, the same bands the risk register uses. */
const cellOf = (r: ErpRecord) => `${String(r.values.likelihood)}-${String(r.values.impact)}`
const heat = (score: number) => (score >= 15 ? 'bg-accent text-white' : score >= 8 ? 'bg-accent-soft text-accent-text' : 'bg-raised text-muted')

/** Executive analytics across the group: inventory turnover, output against plan, sales and purchasing, asset use and risk. */
export default function GroupAnalytics() {
  const navigate = useNavigate()
  const { clock } = useServices()
  const all = useAllRecords()
  const today = clock.today()
  const [cell, setCell] = useState<string | null>(null)

  const k = useMemo(() => {
    if (!all.data) return null
    const d = all.data
    const rules = d['inv.reorder'] ?? []
    const months = Array.from({ length: 6 }, (_, i) => shiftDay(`${today.slice(0, 7)}-15`, -30 * (5 - i)).slice(0, 7))
    const byMonth = (rows: readonly ErpRecord[], date: string, field: string) => months.map((m) => sum(rows.filter((r) => String(r.values[date]).startsWith(m)), field))
    const campaigns = d['cfp.campaigns'] ?? []
    const since = shiftDay(today, -90)
    const recent = (d['eam.workorders'] ?? []).filter((w) => String(w.values.due) >= since)
    const assets = d['eam.assets'] ?? []
    const downtime = new Map<string, number>()
    for (const w of recent) downtime.set(String(w.values.asset), (downtime.get(String(w.values.asset)) ?? 0) + Number(w.values.downtimeHours ?? 0))
    return {
      turnover: sum(rules, 'onHand') ? (sum(rules, 'dailyUse') * 365) / sum(rules, 'onHand') : 0,
      doi: sum(rules, 'dailyUse') ? sum(rules, 'onHand') / sum(rules, 'dailyUse') : 0,
      rules,
      output: sum(campaigns, 'planned') ? sum(campaigns, 'actual') / sum(campaigns, 'planned') : 0,
      campaigns,
      availability: assets.length ? 1 - [...downtime.values()].reduce((s, h) => s + h, 0) / (assets.length * 90 * 24) : 1,
      downtime: [...downtime].sort((a, b) => b[1] - a[1]).slice(0, 6),
      depreciation: ['holding', 'rotama', 'rodame', 'roasi'].map((e) => ({ entity: e, value: sum((d['fin.assets'] ?? []).filter((a) => a.values.entity === e), 'depreciation') })),
      months,
      sales: byMonth(d['fin.receivables'] ?? [], 'due', 'amount'),
      purchases: byMonth(d['vms.orders'] ?? [], 'delivery', 'value'),
      risks: (d['grc.risks'] ?? []).filter((r) => r.status !== 'closed'),
    }
  }, [all.data, today])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const list = (key: string, query = '') => `${recordPath(t(key))}${query}`
  const inCell = cell ? k.risks.filter((r) => cellOf(r) === cell) : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Inventory turnover" value={k.turnover} format={(v) => `${v.toFixed(1)}×`} to={list('inv.reorder')} accent note="annualised, raw materials" />
        <KpiTile label="Days of inventory" value={k.doi} format={(v) => `${Math.round(v)} days`} to={list('inv.reorder')} note="on hand over daily use" />
        <KpiTile label="Output against plan" value={k.output * 100} format={(v) => `${v.toFixed(1)}%`} to={list('cfp.campaigns')} note={`${k.campaigns.length} campaigns`} />
        <KpiTile label="Asset availability, 90 days" value={k.availability * 100} format={(v) => `${v.toFixed(1)}%`} to={list('eam.workorders')} note="downtime from work orders" />
        <KpiTile label="Open high risks" value={k.risks.filter((r) => r.values.level === 'High').length} format={(v) => String(Math.round(v))} to={list('grc.risks', '?status=open')} note={`${k.risks.length} open in the register`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales and purchasing, 6 months" action={<span className="text-xs text-muted">click a month for its invoices</span>} />
          <LineChart
            labels={k.months.map(monthLabel)}
            series={[
              { id: 'sales', label: 'Sales invoiced', values: k.sales, color: 'var(--color-series-1)', area: true },
              { id: 'purchases', label: 'Purchase orders', values: k.purchases, color: 'var(--color-series-2)' },
            ]}
            format={moneyCompact}
            height={220}
            onPick={(i) => navigate(list('fin.receivables', monthQuery(k.months[i]!)))}
            label="Sales invoiced and purchase orders per month"
          />
        </Card>
        <Card>
          <CardHeader title="Days of inventory by material" />
          <BarList
            items={k.rules.map((r) => {
              const days = Number(r.values.dailyUse) ? Number(r.values.onHand) / Number(r.values.dailyUse) : 0
              return { key: r.id, label: refTitle('mdm.materials', String(r.values.material), all.data).split(' · ')[0] ?? r.id, value: days, text: `${Math.round(days)} d`, alert: r.values.action === 'Raise PR', to: recordPath(t('inv.reorder'), r.id) }
            })}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Campaign output against plan" />
          <BarList items={k.campaigns.map((c) => ({ key: c.id, label: String(c.values.name), value: Number(c.values.attainment), text: `${String(c.values.attainment)}%`, alert: Number(c.values.attainment) < 92, to: recordPath(t('cfp.campaigns'), c.id) }))} />
        </Card>
        <Card>
          <CardHeader title="Downtime by asset, 90 days" />
          <BarList items={k.downtime.map(([id, h], i) => ({ key: id, label: refTitle('eam.assets', id, all.data).split(' · ')[0] ?? id, value: h, text: `${Math.round(h)} h`, alert: i === 0, to: recordPath(t('eam.assets'), id) }))} empty="No downtime booked in 90 days." />
          <p className="mt-4 text-xs text-muted">Depreciation per year</p>
          <ul className="mt-1 divide-y divide-line text-sm">
            {k.depreciation.map((e) => (
              <li key={e.entity}>
                <Link to={list('fin.assets', `?f=${e.entity}`)} className="flex justify-between py-1.5 capitalize hover:underline">
                  <span>{e.entity}</span>
                  <span className="tabular text-muted">{moneyCompact(e.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Group risk heat map" action={<span className="text-xs text-muted">pick a cell</span>} />
          <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-center text-xs" role="grid" aria-label="Open risks by likelihood and impact">
            {LEVELS.map((l) => (
              <div key={l} role="row" className="contents">
                <span className="grid place-items-center pr-1 text-subtle">{l}</span>
                {[1, 2, 3, 4, 5].map((i) => {
                  const key = `${l}-${i}`
                  const count = k.risks.filter((r) => cellOf(r) === key).length
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      aria-pressed={cell === key}
                      aria-label={`Likelihood ${l}, impact ${i}: ${count} risks`}
                      onClick={() => setCell(cell === key ? null : key)}
                      className={cn('aspect-square cursor-pointer rounded-xl font-semibold tabular transition-transform active:scale-95', heat(l * i), cell === key && 'ring-2 ring-fg ring-offset-2 ring-offset-card')}
                    >
                      {count || ''}
                    </button>
                  )
                })}
              </div>
            ))}
            <span />
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="pt-1 text-subtle">{i}</span>
            ))}
          </div>
          <p className="mt-1 text-center text-[11px] text-subtle">likelihood up, impact across</p>
          {cell && (
            <ul className="mt-3 divide-y divide-line text-sm">
              {inCell.map((r) => (
                <li key={r.id}>
                  <Link to={recordPath(t('grc.risks'), r.id)} className="block py-1.5 hover:underline">
                    <span className="font-mono text-xs text-muted">{r.id}</span> {String(r.values.title)}
                  </Link>
                </li>
              ))}
              {inCell.length === 0 && <li className="py-1.5 text-muted">No open risk in this cell.</li>}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
