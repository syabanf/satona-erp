import { useMemo, useState } from 'react'
import { perDay, perMonth } from '@/domain/kpi'
import { monthBounds, recordDate, summarize, type ErpRecord, type RecordType } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count, moneyCompact } from '@/lib/format'
import { ColumnChart } from '../charts/ColumnChart'
import { ActivityHeatmap } from '../charts/ActivityHeatmap'
import { Donut } from '../charts/Donut'
import { LineChart } from '../charts/LineChart'
import { useQueryState } from '../hooks/useParams'
import { useServices } from '../hooks/useServices'
import { Card, CardHeader } from '../ui/Card'
import { CountUp } from '../ui/Motion'
import { Tabs } from '../ui/Tabs'
import { fieldText, TONE_COLOR, type AllRecords } from './text'

const PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: 'all', label: 'All' },
] as const

const short = (v: number) => (Math.abs(v) >= 1e6 ? moneyCompact(v).replace('Rp', '').trim() : count(Math.round(v)))

/** Tiles, a status donut, a monthly column chart and the top groups. Clicking a mark filters the table below. */
export function RecordInsight({ type, rows: allRows, all }: { type: RecordType; rows: readonly ErpRecord[]; all?: AllRecords }) {
  const { clock } = useServices()
  const [query, setQuery] = useQueryState(['status', 'f', 'q', 'page', 'from', 'to'] as const)
  const [slice, setSlice] = useState<string | null>(null)
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('all')
  const groupable = type.fields.filter((f) => f.type === 'select' || f.type === 'entity' || f.type === 'ref' || (f.type === 'computed' && !f.unit)).slice(0, 4)
  const [groupKey, setGroupKey] = useState(type.insight.groupBy ?? groupable[0]?.key ?? '')
  const today = clock.today()
  const rows = useMemo(() => {
    if (period === 'all') return allRows
    const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - Number(period) * 86_400_000).toISOString().slice(0, 10)
    return allRows.filter((r) => recordDate(type, r) >= from)
  }, [allRows, period, today, type.insight.dateField])
  const s = useMemo(() => summarize({ ...type, insight: { ...type.insight, groupBy: groupKey } }, rows, today), [type, rows, today, groupKey])
  const dateOf = (r: ErpRecord) => recordDate(type, r)
  /** Drill-down: narrow the table below to a period or status and bring it into view. */
  const drill = (patch: Parameters<typeof setQuery>[0]) => {
    setQuery({ ...patch, page: undefined })
    document.getElementById('record-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const drillMonth = (month: string | undefined) => month && drill(monthBounds(month))
  // A final state has no way out; reaching one counts as finished.
  const finals = type.workflow.states.filter((st) => !type.workflow.transitions.some((t) => t.from === st.id)).map((st) => st.id)
  const finalLabel = type.workflow.states.filter((st) => finals.includes(st.id)).map((st) => st.label.toLowerCase()).join(' or ') || 'a final state'
  const trend = perMonth(allRows, today, 6, dateOf)
  const finished = perMonth(allRows.filter((r) => finals.includes(r.status)), today, 6, (r) => r.updatedAt)
  const activity = perDay(allRows, today, 84, dateOf)
  const sumField = type.fields.find((f) => f.key === type.insight.sumField)
  const groupField = type.fields.find((f) => f.key === groupKey)
  const isMoney = sumField?.type === 'money' || sumField?.unit === 'Rp'
  const sumText = (v: number) => (isMoney ? moneyCompact(v) : `${count(Math.round(v))}${sumField?.unit ? ` ${sumField.unit}` : ''}`)
  const [first, second] = [...type.workflow.states].sort((a, b) => (s.byStatus[b.id] ?? 0) - (s.byStatus[a.id] ?? 0))
  const [month, setMonth] = useState(String(s.monthly.length - 1))
  const monthKey = s.monthly[Number(month)]?.month
  const useSum = Boolean(sumField) && s.sum > 0
  const groupMax = Math.max(1, ...s.byGroup.map((g) => g.count))
  // The table's `f` filter belongs to one picker field (see RecordTable); other breakdowns filter by search.
  const pickerKey = (type.fields.find((f) => f.key === type.insight.groupBy && (f.type === 'select' || f.type === 'entity')) ?? type.fields.find((f) => f.type === 'select' || f.type === 'entity'))?.key
  const filterable = groupField?.key === pickerKey

  const tiles = [
    { label: type.name, value: s.count, fmt: (v: number) => count(Math.round(v)) },
    ...(useSum && sumField ? [{ label: `Total ${sumField.label.toLowerCase()}`, value: s.sum, fmt: sumText }] : []),
    ...[first, second].filter(Boolean).map((st) => ({ label: st!.label, value: s.byStatus[st!.id] ?? 0, fmt: (v: number) => count(Math.round(v)), status: st!.id })),
  ].slice(0, 4)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        {groupable.length > 1 && (
          <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
            <span className="eyebrow shrink-0">Break down by</span>
            <Tabs label="Break down by" options={groupable.map((f) => ({ value: f.key, label: f.label }))} value={groupKey} onChange={setGroupKey} variant="underline" />
          </div>
        )}
        {period !== 'all' && <span className="text-xs text-muted tabular">{rows.length} of {allRows.length} records</span>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            data-motion="rise"
            onClick={() => 'status' in t && setQuery({ status: query.status === t.status ? undefined : t.status, page: undefined })}
            aria-pressed={'status' in t ? query.status === t.status : undefined}
            className={cn(
              'rounded-card border p-5 text-left shadow-card transition-[background-color,translate] duration-300 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1',
              'status' in t && query.status === t.status ? 'border-transparent bg-invert text-on-invert' : 'border-line bg-card',
              'status' in t ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            <p className={cn('truncate text-xs', 'status' in t && query.status === t.status ? 'opacity-70' : 'text-muted')}>{t.label}</p>
            <p className="mt-2 text-[26px] font-medium tracking-tight tabular">
              <CountUp value={t.value} format={t.fmt} />
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="By status" />
          <div className="flex flex-col items-center gap-3">
            <Donut
              size={170}
              stroke={20}
              slices={type.workflow.states.map((st) => ({ id: st.id, label: st.label, value: s.byStatus[st.id] ?? 0, color: TONE_COLOR[st.tone] })).filter((x) => x.value > 0)}
              active={slice}
              onActive={setSlice}
              onPick={(id) => drill({ status: query.status === id ? undefined : id })}
              chip={(x) => `${x.label}, ${x.value}`}
              label={`${type.name} by status`}
            >
              <p className="text-xs text-muted">Total</p>
              <p className="text-lg font-semibold tabular">{s.count}</p>
            </Donut>
            <ul className="w-full space-y-0.5">
              {type.workflow.states.map((st) => (
                <li key={st.id}>
                  <button
                    type="button"
                    onClick={() => setQuery({ status: query.status === st.id ? undefined : st.id, page: undefined })}
                    onMouseEnter={() => setSlice(st.id)}
                    onMouseLeave={() => setSlice(null)}
                    className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-raised', query.status === st.id && 'bg-raised font-medium')}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[st.tone] }} />
                    <span className="flex-1 text-left">{st.label}</span>
                    <span className="tabular text-muted">{s.byStatus[st.id] ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title={useSum && sumField ? `${sumField.label} by month` : 'New per month'} />
          <ColumnChart
            data={s.monthly.map((m, i) => ({ key: String(i), label: new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), value: useSum ? m.sum : m.count }))}
            selected={month}
            onSelect={(k) => {
              setMonth(k)
              drillMonth(s.monthly[Number(k)]?.month)
            }}
            format={useSum ? short : (v) => String(Math.round(v))}
            showAxis={false}
            label={`${type.name} per month`}
            className="h-56"
          />
          {monthKey && (
            <p className="mt-2 text-xs text-muted">
              {monthKey}: {s.monthly[Number(month)]?.count ?? 0} records{useSum ? `, ${sumText(s.monthly[Number(month)]?.sum ?? 0)}` : ''}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title={groupField ? `By ${groupField.label.toLowerCase()}` : 'Latest'} />
          {groupField ? (
            <ul className="space-y-2.5">
              {s.byGroup.slice(0, 7).map((g) => {
                const on = filterable ? query.f === g.key : false
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => (filterable ? setQuery({ f: on ? undefined : g.key, page: undefined }) : setQuery({ q: g.key, page: undefined }))}
                      className="w-full cursor-pointer text-left"
                    >
                      <span className={cn('flex justify-between gap-2 text-sm', on && 'font-semibold')}>
                        <span className="truncate">{fieldText(groupField, g.key, all)}</span>
                        <span className="shrink-0 tabular text-muted">{useSum ? sumText(g.sum) : g.count}</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-control">
                        <span className={cn('block h-full rounded-full transition-[width] duration-700', on ? 'bg-accent' : 'bg-fg')} style={{ width: `${(g.count / groupMax) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {[...rows]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 6)
                .map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 py-2">
                    <span className="font-mono text-xs">{r.id}</span>
                    <span className="text-xs text-muted">{r.updatedAt.slice(0, 10)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Created and finished, 6 months" />
          <LineChart
            onPick={(i) => drillMonth(trend[i]?.month)}
            labels={trend.map((m) => new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))}
            series={[
              { id: 'created', label: 'Created', values: trend.map((m) => m.count), color: 'var(--color-series-1)', area: true },
              { id: 'finished', label: 'Finished', values: finished.map((m) => m.count), color: 'var(--color-series-2)' },
            ]}
            format={(v) => `${v} records`}
            height={200}
            label={`${type.name} created and finished per month`}
          />
          <p className="mt-2 flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-1" /> Created</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-2" /> Reached {finalLabel}</span>
          </p>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Activity, last 12 weeks" />
          <ActivityHeatmap days={activity} label={`${type.name} per day over 12 weeks`} onDay={(day) => drill({ from: day, to: day })} />
        </Card>
      </div>
    </div>
  )
}
