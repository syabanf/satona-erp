import { Link } from 'react-router'
import { ArrowUpRight, Plus } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import { perMonth } from '@/domain/kpi'
import { canCreate, summarize } from '@/domain/records'
import { moneyCompact, count } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { LineChart } from '../../charts/LineChart'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { recordPath, TONE_COLOR } from '../../records/text'
import { useModule } from './context'

/** Module insight: the spreadsheet KPIs, then one card per record type with its status mix and total. */
export default function ModuleInsight() {
  const { module: m, access } = useModule()
  const { clock } = useServices()
  const all = useAllRecords()
  if (!all.data) return <CardSkeleton lines={6} />
  const types = typesOf(m.id)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {m.kpis.map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-[26px] font-medium tracking-tight tabular">{k.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Activity per record type, 6 months" />
        <LineChart
          labels={perMonth([], clock.today(), 6, () => '').map((m) => new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))}
          series={types.slice(0, 5).map((t, i) => ({
            id: t.key,
            label: t.name,
            values: perMonth(all.data?.[t.key] ?? [], clock.today(), 6, (r) => String((t.insight.dateField ? r.values[t.insight.dateField] : undefined) ?? r.createdAt)).map((m) => m.count),
            color: seriesColor(i + 1),
            area: i === 0,
          }))}
          format={(v) => `${v} records`}
          height={220}
          label={`${m.code} records per month`}
        />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {types.slice(0, 5).map((t, i) => (
            <li key={t.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: seriesColor(i + 1) }} />
              {t.name}
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {types.map((t) => {
          const rows = all.data?.[t.key] ?? []
          const s = summarize(t, rows, clock.today())
          const sumField = t.fields.find((f) => f.key === t.insight.sumField)
          const money = sumField?.type === 'money' || sumField?.unit === 'Rp'
          const recent = s.monthly.at(-1)?.count ?? 0
          return (
            <Card key={t.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{t.name}</h2>
                  <p className="text-xs text-muted">{recent} new this month</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canCreate(t, access) && (
                    <Link to={`${recordPath(t)}/new`} className={buttonStyles({ variant: 'soft', size: 'icon-sm' })} aria-label={`New ${t.singular.toLowerCase()}`} title={`New ${t.singular.toLowerCase()}`}>
                      <Plus aria-hidden className="size-4" />
                    </Link>
                  )}
                  <Link to={recordPath(t)} className={buttonStyles({ variant: 'solid', size: 'sm' })}>
                    Open <ArrowUpRight aria-hidden className="size-3.5" />
                  </Link>
                </div>
              </div>
              <p className="mt-4 text-[32px] font-medium tracking-tight tabular">
                {count(s.count)}
                {sumField && s.sum > 0 && <span className="ml-2 text-sm text-muted">{money ? moneyCompact(s.sum) : `${count(Math.round(s.sum))} ${sumField.unit ?? ''}`} total</span>}
              </p>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-control" aria-hidden>
                {t.workflow.states.map((st) => (
                  <span key={st.id} className="h-full transition-[width] duration-700" style={{ width: `${((s.byStatus[st.id] ?? 0) / Math.max(1, s.count)) * 100}%`, background: TONE_COLOR[st.tone] }} />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {t.workflow.states.map((st) => (
                  <li key={st.id}>
                    <Link to={`${recordPath(t)}?status=${st.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-fg hover:underline">
                      <span className="size-2 rounded-full" style={{ background: TONE_COLOR[st.tone] }} />
                      {st.label} <span className="font-medium text-fg tabular">{s.byStatus[st.id] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
