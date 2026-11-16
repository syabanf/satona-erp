import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarCheck, Download, Printer, TrendingDown } from 'lucide-react'
import { closingEntry, depreciationRun } from '@/domain/ledger'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { toCsv } from '@/lib/csv'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { ENTITY_NAME } from '../../records/text'
import { Button } from '../../ui/Button'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card } from '../../ui/Card'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/useToast'
import { buildReport, REPORTS, type Report, type ReportId } from './reports'

const field = 'h-10 rounded-full border border-line-strong bg-card px-3 text-base text-fg md:text-sm'

/** Reads the report, unit and period from the URL and builds the table. Shared by the screen and the print view. */
function useReport(tab: ReportId) {
  const [params] = useSearchParams()
  const all = useAllRecords()
  const { clock } = useServices()
  const today = clock.today()
  const entity = params.get('entity') || undefined
  const from = params.get('from') || `${today.slice(0, 4)}-01-01`
  const to = params.get('to') || today
  const account = params.get('account') || undefined
  const query = `${entity ? `&entity=${entity}` : ''}&from=${from}&to=${to}`
  const report = all.data ? buildReport(tab, all.data, { entity, from, to }, { account, today, query }) : null
  return { all, report, entity, from, to, account, today }
}

function ReportTable({ report, print = false }: { report: Report; print?: boolean }) {
  return (
    <div className={cn(!print && 'overflow-x-auto')}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-muted">
            {report.columns.map((c, i) => (
              <th key={c} className={cn('px-2 py-2 font-medium', i >= report.numericFrom && 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => (
            <tr key={ri} className={cn('border-b border-line', r.kind === 'head' && 'bg-raised font-semibold', r.kind === 'total' && 'font-semibold', r.kind === 'grand' && 'border-t-2 border-t-fg bg-raised font-bold')}>
              {r.cells.map((c, i) => (
                <td key={i} className={cn('px-2 py-2', i >= report.numericFrom && 'text-right whitespace-nowrap tabular', i === 0 && !r.kind && 'pl-5')}>
                  {i === 0 && r.to && !print ? (
                    <Link to={r.to} className="hover:text-accent-text hover:underline">
                      {c}
                    </Link>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
          {report.rows.length === 0 && (
            <tr>
              <td colSpan={report.columns.length} className="px-2 py-8 text-center text-muted">
                {report.note}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Financial reports from the posted ledger: trial balance, general ledger, balance sheet, profit and loss, cash flow,
 * aging, the fixed-asset register and budget against actual. Unit and period sit in the URL; every account row opens
 * its ledger and every ledger row its journal. Also runs the month's depreciation and the year-end close.
 */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (REPORTS.find((r) => r.value === params.get('tab'))?.value ?? 'tb') as ReportId
  const { all, report, entity, from, to, account, today } = useReport(tab)
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const set = (k: string, v: string | undefined) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })

  if (!all.data || !report) return <CardSkeleton lines={10} />
  const data = all.data
  const accounts = (data['mdm.accounts'] ?? []).filter((a) => a.values.postable === 'Yes').sort((a, b) => String(a.values.code).localeCompare(String(b.values.code)))
  const period = today.slice(0, 7)
  const year = Number(today.slice(0, 4))
  const depreciation = depreciationRun(data, period)
  const closes = Object.keys(ENTITY_NAME).flatMap((e) => closingEntry(data, e, year) ?? [])

  const post = async (what: string, postings: typeof depreciation, done: string) => {
    setBusy(what)
    try {
      for (const p of postings) await records.post(role, p)
      toast({ title: `${postings.length} ${done}` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Tidak diposting', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
      setClosing(false)
    }
  }
  const exportCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${toCsv([[report.title, report.note], report.columns, ...report.rows.map((r) => r.cells)])}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `${tab}-${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="no-scrollbar overflow-x-auto">
        <Tabs label="Laporan" options={REPORTS} value={tab} onChange={(t) => set('tab', t)} />
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            Unit
            <select value={entity ?? ''} onChange={(e) => set('entity', e.target.value || undefined)} className={cn(field, 'mt-1 block cursor-pointer')}>
              <option value="">Semua unit</option>
              {Object.entries(ENTITY_NAME).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Dari
            <input type="date" value={from} onChange={(e) => set('from', e.target.value)} className={cn(field, 'mt-1 block')} />
          </label>
          <label className="text-xs text-muted">
            Sampai
            <input type="date" value={to} onChange={(e) => set('to', e.target.value)} className={cn(field, 'mt-1 block')} />
          </label>
          {tab === 'gl' && (
            <label className="min-w-0 text-xs text-muted">
              Akun
              <select value={account ?? ''} onChange={(e) => set('account', e.target.value || undefined)} className={cn(field, 'mt-1 block max-w-64 cursor-pointer')}>
                <option value="">Pilih akun</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {String(a.values.code)} {String(a.values.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            <Button variant="card" size="sm" onClick={exportCsv} disabled={!report.rows.length}>
              <Download aria-hidden className="size-4" /> CSV
            </Button>
            <Link to={`/print/finance/${tab}?${params.toString()}`} className={buttonStyles({ variant: 'card', size: 'sm' })}>
              <Printer aria-hidden className="size-4" /> Cetak / PDF
            </Link>
          </span>
        </div>
        <h2 className="text-lg font-semibold">{report.title}</h2>
        <p className="mb-3 text-xs text-muted">
          {entity ? ENTITY_NAME[entity] : 'Semua unit'} · {report.note}
        </p>
        <ReportTable report={report} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Proses akhir periode</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-3 rounded-panel bg-raised p-3">
            <TrendingDown aria-hidden className="size-5 text-muted" />
            <span className="min-w-0 flex-1 basis-40 text-sm">
              <span className="block font-semibold">Penyusutan {period}</span>
              <span className="block text-xs text-muted">{depreciation.length ? `${depreciation.length} unit belum disusutkan bulan ini` : 'Semua unit sudah disusutkan bulan ini'}</span>
            </span>
            <Button size="sm" variant="accent" disabled={!depreciation.length} loading={busy === 'dep'} onClick={() => post('dep', depreciation, 'jurnal penyusutan diposting')}>
              Jalankan penyusutan
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-panel bg-raised p-3">
            <CalendarCheck aria-hidden className="size-5 text-muted" />
            <span className="min-w-0 flex-1 basis-40 text-sm">
              <span className="block font-semibold">Tutup buku {year}</span>
              <span className="block text-xs text-muted">{closes.length ? `${closes.length} unit: laba rugi dipindah ke laba ditahan` : 'Semua unit sudah ditutup'}</span>
            </span>
            <Button size="sm" variant="card" disabled={!closes.length} onClick={() => setClosing(true)}>
              Tutup buku
            </Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog open={closing} title={`Tutup buku ${year}?`} confirm="Tutup buku" busy={busy === 'close'} onConfirm={() => post('close', closes, 'jurnal penutup diposting')} onClose={() => setClosing(false)}>
        Saldo pendapatan dan beban {year} tiap unit dipindahkan ke laba ditahan lewat jurnal penutup. Laba rugi tahun ini menjadi nol.
      </ConfirmDialog>
    </div>
  )
}

/** The same report as an A4 document with the letterhead, outside the app shell. */
export function ReportPrint() {
  const { tab = 'tb' } = useParams()
  const id = (REPORTS.find((r) => r.value === tab)?.value ?? 'tb') as ReportId
  const [params] = useSearchParams()
  const { signedIn, role } = useSession()
  const { all, report, entity } = useReport(id)
  if (!signedIn) return <Navigate to="/login" replace />
  if (!all.data || !report) return <CardSkeleton lines={10} />
  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center gap-3 px-4">
        <Link to={`/finance/reports?${params.toString()}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke laporan
        </Link>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow">
          <Printer aria-hidden className="size-4" /> Cetak / Simpan PDF
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[12px] text-[#101112] shadow-float print:max-w-none print:p-0 print:shadow-none [&_*]:!border-[#d9d8dc] [&_.bg-raised]:!bg-[#f1f0f1] [&_.text-muted]:!text-[#555]">
        <header className="flex items-start justify-between gap-6 border-b-2 !border-[#101112] pb-4">
          <img src="/wit-logo-ink.png" alt="WIT" className="h-9 w-auto" />
          <div className="text-right">
            <p className="text-base font-bold uppercase">{entity ? ENTITY_NAME[entity] : 'Semua unit'}</p>
            <p className="text-[11px] text-[#555]">{APP_NAME}</p>
          </div>
        </header>
        <h1 className="mt-5 text-xl font-bold uppercase">{report.title}</h1>
        <p className="mb-4 text-[11px] text-[#555]">{report.note}</p>
        <ReportTable report={report} print />
        <footer className="mt-8 text-[10px] text-[#777]">
          Dicetak oleh {role.name} pada {new Date().toLocaleString('id-ID')}. Angka berasal dari jurnal yang sudah diposting.
        </footer>
      </article>
    </div>
  )
}
