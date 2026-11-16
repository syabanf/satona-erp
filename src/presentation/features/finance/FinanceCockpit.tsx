import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { FileBarChart, FolderTree, Landmark } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { aging, perMonth, shiftDay } from '@/domain/kpi'
import { incomeStatement, trialBalance } from '@/domain/ledger'
import { cn } from '@/lib/cn'
import { moneyCompact, monthLabel } from '@/lib/format'
import { ColumnChart } from '../../charts/ColumnChart'
import { LineChart } from '../../charts/LineChart'
import { recordPath, refTitle, monthQuery, rangeQuery } from '../../records/text'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { BarList } from '../../ui/BarList'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { KpiTile } from '../mes/KpiTile'
import { NewButtons } from '../../records/NewButtons'
import { RecordControls } from '../../records/RecordControls'

const t = (key: string) => typeOf(key)!
const SIDES = [
  { value: 'ap', label: 'Utang' },
  { value: 'ar', label: 'Piutang' },
] as const
const short = (v: number) => moneyCompact(v).replace('Rp', '').trim()
/** Due-date offsets from today for each aging bucket, so a bucket opens exactly its invoices. */
const AGING_DAYS: ReadonlyArray<[number | undefined, number | undefined]> = [[0, undefined], [-30, -1], [-60, -31], [undefined, -61]]

/** Finance cockpit: profit and cash from the posted ledger, open payables and receivables, journals to approve and the close. */
export default function FinanceCockpit() {
  const navigate = useNavigate()
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
    const sum = (rows: typeof ap) => rows.reduce((s, r) => s + Number(r.values.amount), 0)
    return {
      ap: { open: sum(ap), overdue: sum(ap.filter((r) => String(r.values.due) < today)), aging: aging(ap, 'due', 'amount', today) },
      ar: { open: sum(ar), overdue: sum(ar.filter((r) => String(r.values.due) < today)), aging: aging(ar, 'due', 'amount', today) },
      waiting: journals.filter((j) => j.status === 'submitted').length,
      cash: trialBalance(d, { to: today }).rows.filter((r) => r.account.values.kind === 'Cash and bank').reduce((s, r) => s + r.balance, 0),
      pl: incomeStatement(d, { from: `${today.slice(0, 4)}-01-01`, to: today }),
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
  const bucketQuery = (i: number) => {
    const [from, to] = AGING_DAYS[i] ?? []
    return rangeQuery(from === undefined ? undefined : shiftDay(today, from), to === undefined ? undefined : shiftDay(today, to))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NewButtons types={['fin.journals', 'fin.payables', 'fin.receivables', 'fin.payments', 'fin.pettycash']} />
        <Link to="/finance/coa" className={cn(buttonStyles({ variant: 'card', size: 'sm' }), 'sm:ml-auto')}>
          <FolderTree aria-hidden className="size-4" /> Bagan akun
        </Link>
        <Link to="/finance/reports" className={buttonStyles({ variant: 'card', size: 'sm' })}>
          <FileBarChart aria-hidden className="size-4" /> Laporan keuangan
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Pendapatan tahun berjalan" value={k.pl.revenue.total} format={moneyCompact} to="/finance/reports?tab=pl" accent note="dari jurnal yang diposting" />
        <KpiTile label="Laba kotor" value={k.pl.gross} format={moneyCompact} to="/finance/reports?tab=pl" note={`${k.pl.revenue.total ? Math.round((k.pl.gross / k.pl.revenue.total) * 100) : 0}% dari pendapatan`} />
        <KpiTile label="Laba bersih" value={k.pl.net} format={moneyCompact} to="/finance/reports?tab=pl" note={`${k.pl.revenue.total ? Math.round((k.pl.net / k.pl.revenue.total) * 100) : 0}% dari pendapatan`} />
        <KpiTile label="Kas dan bank" value={k.cash} format={moneyCompact} to="/finance/reports?tab=cf" note="saldo buku besar" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Utang terbuka" value={k.ap.open} format={moneyCompact} to={list('fin.payables')} note={`${moneyCompact(k.ap.overdue)} lewat jatuh tempo`} />
        <KpiTile label="Piutang terbuka" value={k.ar.open} format={moneyCompact} to={list('fin.receivables')} note={`${moneyCompact(k.ar.overdue)} lewat jatuh tempo`} />
        <KpiTile label="Jurnal menunggu persetujuan" value={k.waiting} format={(v) => String(Math.round(v))} to={list('fin.journals', '?status=submitted')} note="sesuai matriks persetujuan" />
        <KpiTile label="Bank belum rekonsiliasi" value={k.unreconciled.length} format={(v) => String(Math.round(v))} to={list('fin.reconciliations', '?status=open')} note="rekening koran beda dengan buku" />
        <KpiTile label="Faktur pajak tertunda" value={(all.data['fin.taxinvoices'] ?? []).filter((x) => x.status === 'draft').length} format={(v) => String(Math.round(v))} to={list('fin.taxinvoices', '?status=draft')} note="belum diunggah ke e-Faktur" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Umur utang dan piutang" action={<Tabs label="Buku" options={SIDES} value={side} onChange={setSide} />} />
          <ColumnChart
            data={book.aging.map((b, i) => ({ key: String(i), label: b.label, value: b.amount }))}
            selected={bucket}
            onSelect={setBucket}
            format={short}
            showAxis={false}
            label={`${side === 'ap' ? 'Utang' : 'Piutang'} menurut hari lewat jatuh tempo`}
            className="h-56"
          />
          {picked && (
            <p className="mt-2 text-xs text-muted">
              {picked.label}: {picked.count} dokumen, {moneyCompact(picked.amount)}.{' '}
              <Link to={list(side === 'ap' ? 'fin.payables' : 'fin.receivables', bucketQuery(Number(bucket ?? 0)))} className="font-medium text-accent-text hover:underline">
                Buka dokumennya
              </Link>
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title="Utang terbuka terbesar" />
          <BarList items={k.vendors.map(([id, value], i) => ({ key: id, label: refTitle('mdm.partners', id, all.data).split(' · ')[0] ?? id, value, text: moneyCompact(value), alert: i === 0, to: recordPath(t('mdm.partners'), id) }))} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Jurnal menunggu persetujuan" action={<span className="text-xs text-muted">setujui, tolak atau ubah di tempat</span>} />
        <ul className="divide-y divide-line">
          {(all.data['fin.journals'] ?? [])
            .filter((j) => j.status === 'submitted')
            .slice(0, 6)
            .map((j) => (
              <li key={j.id} data-motion="row" className="flex flex-wrap items-center gap-3 py-2.5">
                <Link to={recordPath(t('fin.journals'), j.id)} className="min-w-0 flex-1 basis-56 text-sm hover:underline">
                  <span className="block truncate font-medium">{String(j.values.description)}</span>
                  <span className="block text-xs text-muted">
                    <span className="font-mono">{j.id}</span> · {moneyCompact(Number(j.values.amount))} · {String(j.values.date)}
                  </span>
                </Link>
                <RecordControls type={t('fin.journals')} record={j} view />
              </li>
            ))}
        </ul>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Jurnal dibuat dan diposting, 6 bulan" />
          <LineChart
            labels={k.trend.all.map((m) => monthLabel(m.month))}
            series={[
              { id: 'all', label: 'Dibuat', values: k.trend.all.map((m) => m.count), color: 'var(--color-series-2)', area: true },
              { id: 'posted', label: 'Diposting', values: k.trend.posted.map((m) => m.count), color: 'var(--color-series-1)' },
            ]}
            format={(v) => `${v} jurnal`}
            height={200}
            onPick={(i) => navigate(list('fin.journals', monthQuery(k.trend.all[i]!.month)))}
            label="Jurnal dibuat dan diposting per bulan"
          />
        </Card>
        <Card>
          <CardHeader title="Tutup periode" icon={<Landmark aria-hidden className="size-5 text-muted" />} />
          <ul className="space-y-3">
            {k.close.map((c) => (
              <li key={c.period}>
                <Link to={recordPath(t('epm.periods'), c.period)} className="block hover:opacity-80">
                  <span className="flex justify-between text-sm">
                    <span className="truncate">{refTitle('epm.periods', c.period, all.data).split(' · ')[0]}</span>
                    <span className={cn('text-xs tabular', c.done === c.total ? 'text-success' : 'text-muted')}>
                      {c.done} dari {c.total} tugas
                    </span>
                  </span>
                  <Meter value={c.total ? c.done / c.total : 0} tone={c.done === c.total ? 'success' : 'accent'} className="mt-1" label={`Progres tutup ${c.period}`} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
