import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Landmark } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { aging, perMonth } from '@/domain/kpi'
import { cn } from '@/lib/cn'
import { moneyCompact, monthLabel } from '@/lib/format'
import { ColumnChart } from '../../charts/ColumnChart'
import { LineChart } from '../../charts/LineChart'
import { recordPath, refTitle } from '../../records/text'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { BarList } from '../../ui/BarList'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { KpiTile } from '../mes/KpiTile'

const t = (key: string) => typeOf(key)!
const SIDES = [
  { value: 'ap', label: 'Payables' },
  { value: 'ar', label: 'Receivables' },
] as const
const short = (v: number) => moneyCompact(v).replace('Rp', '').trim()

/** Finance and accounting cockpit, carried over from the Habitat accounting dashboard. */
export default function FinanceCockpit() {
  const { clock } = useServices()
  const all = useAllRecords()
  const [side, setSide] = useState<(typeof SIDES)[number]['value']>('ap')
  const [bucket, setBucket] = useState<string | null>('1')
  const today = clock.today()

  const k = useMemo(() => {
    if (!all.data) return null
    const d = all.data
    const ap = (d['fin.payables'] ?? []).filter((r) => r.status !== 'paid')
    const ar = (d['fin.receivables'] ?? []).filter((r) => r.status !== 'paid')
    const journals = d['fin.journals'] ?? []
    const vendors = new Map<string, number>()
    for (const r of ap) vendors.set(String(r.values.vendor), (vendors.get(String(r.values.vendor)) ?? 0) + Number(r.values.amount))
    const close = d['fin.closing'] ?? []
    const periods = [...new Set(close.map((c) => String(c.values.period)))]
    const recs = d['fin.reconciliations'] ?? []
    const latest = recs.map((r) => String(r.values.period)).sort().at(-1)
    const sum = (rows: typeof ap) => rows.reduce((s, r) => s + Number(r.values.amount), 0)
    return {
      ap: { open: sum(ap), overdue: sum(ap.filter((r) => String(r.values.due) < today)), aging: aging(ap, 'due', 'amount', today) },
      ar: { open: sum(ar), overdue: sum(ar.filter((r) => String(r.values.due) < today)), aging: aging(ar, 'due', 'amount', today) },
      waiting: journals.filter((j) => j.status === 'submitted').length,
      cash: recs.filter((r) => r.values.period === latest).reduce((s, r) => s + Number(r.values.statement), 0),
      unreconciled: recs.filter((r) => r.status !== 'approved' && Number(r.values.difference) !== 0),
      trend: {
        posted: perMonth(journals.filter((j) => j.status === 'posted'), today, 6, (r) => String(r.values.date)),
        all: perMonth(journals, today, 6, (r) => String(r.values.date)),
      },
      vendors: [...vendors].sort((a, b) => b[1] - a[1]).slice(0, 6),
      close: periods.map((p) => ({ period: p, done: close.filter((c) => c.values.period === p && c.status === 'done').length, total: close.filter((c) => c.values.period === p).length })),
    }
  }, [all.data, today])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const list = (key: string, query = '') => `${recordPath(t(key))}${query}`
  const book = side === 'ap' ? k.ap : k.ar
  const picked = book.aging[Number(bucket ?? 0)]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Open payables" value={k.ap.open} format={moneyCompact} to={list('fin.payables')} accent note={`${moneyCompact(k.ap.overdue)} overdue`} />
        <KpiTile label="Open receivables" value={k.ar.open} format={moneyCompact} to={list('fin.receivables')} note={`${moneyCompact(k.ar.overdue)} overdue`} />
        <KpiTile label="Cash at bank" value={k.cash} format={moneyCompact} to={list('fin.reconciliations')} note="latest bank statements" />
        <KpiTile label="Journals to approve" value={k.waiting} format={(v) => String(Math.round(v))} to={list('fin.journals', '?status=submitted')} note="by the approval matrix" />
        <KpiTile label="Unreconciled banks" value={k.unreconciled.length} format={(v) => String(Math.round(v))} to={list('fin.reconciliations', '?status=open')} note="statement differs from ledger" />
        <KpiTile label="Tax invoices pending" value={(all.data['fin.taxinvoices'] ?? []).filter((x) => x.status === 'draft').length} format={(v) => String(Math.round(v))} to={list('fin.taxinvoices', '?status=draft')} note="not yet uploaded to e-Faktur" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Aging" action={<Tabs label="Ledger" options={SIDES} value={side} onChange={setSide} />} />
          <ColumnChart
            data={book.aging.map((b, i) => ({ key: String(i), label: b.label, value: b.amount }))}
            selected={bucket}
            onSelect={setBucket}
            format={short}
            showAxis={false}
            label={`${side === 'ap' ? 'Payables' : 'Receivables'} by days past due`}
            className="h-56"
          />
          {picked && (
            <p className="mt-2 text-xs text-muted">
              {picked.label}: {picked.count} invoices, {moneyCompact(picked.amount)}.{' '}
              <Link to={list(side === 'ap' ? 'fin.payables' : 'fin.receivables')} className="font-medium text-accent-text hover:underline">
                Open the ledger
              </Link>
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title="Largest open payables" />
          <BarList items={k.vendors.map(([id, value], i) => ({ key: id, label: refTitle('mdm.partners', id, all.data).split(' · ')[0] ?? id, value, text: moneyCompact(value), alert: i === 0, to: recordPath(t('mdm.partners'), id) }))} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Journals entered and posted, 6 months" />
          <LineChart
            labels={k.trend.all.map((m) => monthLabel(m.month))}
            series={[
              { id: 'all', label: 'Entered', values: k.trend.all.map((m) => m.count), color: 'var(--color-series-2)', area: true },
              { id: 'posted', label: 'Posted', values: k.trend.posted.map((m) => m.count), color: 'var(--color-series-1)' },
            ]}
            format={(v) => `${v} journals`}
            height={200}
            label="Journals entered and posted per month"
          />
        </Card>
        <Card>
          <CardHeader title="Period close" icon={<Landmark aria-hidden className="size-5 text-muted" />} />
          <ul className="space-y-3">
            {k.close.map((c) => (
              <li key={c.period}>
                <Link to={recordPath(t('epm.periods'), c.period)} className="block hover:opacity-80">
                  <span className="flex justify-between text-sm">
                    <span className="truncate">{refTitle('epm.periods', c.period, all.data).split(' · ')[0]}</span>
                    <span className={cn('text-xs tabular', c.done === c.total ? 'text-success' : 'text-muted')}>
                      {c.done} of {c.total} tasks
                    </span>
                  </span>
                  <Meter value={c.total ? c.done / c.total : 0} tone={c.done === c.total ? 'success' : 'accent'} className="mt-1" label={`Close progress ${c.period}`} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
