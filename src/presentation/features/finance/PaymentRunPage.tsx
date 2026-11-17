import { useState } from 'react'
import { Link } from 'react-router'
import { Download, Send } from 'lucide-react'
import { runTransfer } from '@/domain/bank'
import { payableDue, runInvoices } from '@/domain/effects'
import { cn } from '@/lib/cn'
import { toCsv } from '@/lib/csv'
import { money } from '@/lib/format'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StateBadge } from '../../records/StateBadge'
import { refTitle } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { typeOf } from '@/domain/catalog'

/**
 * Payment runs: pick the approved vendor invoices to pay from one bank on one date. The run is approved and executed
 * from its own page; executing posts one journal, marks every invoice paid and the transfer file lists each vendor.
 */
export default function PaymentRunPage() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [bankId, setBankId] = useState('')
  const [busy, setBusy] = useState(false)
  if (!all.data) return <CardSkeleton lines={8} />
  const data = all.data
  const type = typeOf('fin.paymentruns')!
  const runs = (data[type.key] ?? []).toSorted((a, b) => b.id.localeCompare(a.id))
  const inRun = new Set(runs.filter((r) => ['draft', 'approved'].includes(r.status)).flatMap((r) => runInvoices(data, r).map((i) => i.id)))
  // Rupiah invoices approved to pay that no open run has taken yet, soonest due first.
  const due = (data['fin.payables'] ?? []).filter((p) => p.status === 'approved' && p.values.currency !== 'USD' && !inRun.has(p.id)).toSorted((a, b) => String(a.values.due).localeCompare(String(b.values.due)))
  const picked = due.filter((p) => !skipped.has(p.id))
  const total = picked.reduce((s, p) => s + payableDue(p), 0)
  const banks = (data['mdm.banks'] ?? []).filter((b) => b.values.currency === 'IDR')
  const bank = banks.find((b) => b.id === bankId) ?? banks[0]

  const create = async () => {
    setBusy(true)
    try {
      const run = await records.create(role, type.key, { description: `Pembayaran pemasok ${clock.today()}`, bank: bank!.id, date: clock.today(), invoices: picked.map((p) => p.id).join(', '), count: picked.length, total })
      toast({ title: `${run.id} dibuat`, description: `${picked.length} tagihan, ${money(total)}. Setujui lalu jalankan dari halaman run.` })
      setSkipped(new Set())
    } catch (e) {
      toast({ tone: 'danger', title: 'Run tidak dibuat', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const download = (run: (typeof runs)[number]) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${toCsv(runTransfer(data, run, runInvoices(data, run), payableDue))}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `transfer-${run.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Tagihan siap dibayar"
          action={
            <span className="flex flex-wrap items-center gap-2">
              <select value={bank?.id ?? ''} onChange={(e) => setBankId(e.target.value)} aria-label="Rekening sumber" className="h-9 cursor-pointer rounded-full border border-line-strong bg-card px-3 text-sm">
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{`${String(b.values.name)} ${String(b.values.account)}`}</option>
                ))}
              </select>
              <Button size="sm" variant="accent" disabled={!picked.length || !bank} loading={busy} onClick={create}>
                <Send aria-hidden className="size-4" /> Buat run {money(total)}
              </Button>
            </span>
          }
        />
        {due.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Tidak ada tagihan disetujui yang menunggu pembayaran.</p>
        ) : (
          <ul className="divide-y divide-line">
            {due.map((p) => (
              <li key={p.id}>
                <label className={cn('flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2.5', skipped.has(p.id) && 'opacity-50')}>
                  <input type="checkbox" checked={!skipped.has(p.id)} onChange={() => setSkipped((s) => new Set(s.has(p.id) ? [...s].filter((x) => x !== p.id) : [...s, p.id]))} className="size-4 accent-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate text-sm font-medium">{refTitle('mdm.partners', String(p.values.vendor), data).split(' · ')[0]}</span>
                    <span className="block text-xs text-muted">
                      <span className="font-mono">{p.id}</span> · {String(p.values.invoiceNo)} · jatuh tempo {String(p.values.due)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular">{money(payableDue(p))}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Payment run" />
        {runs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Belum ada payment run.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <Link to={`/modules/fin/paymentruns/${r.id}`} className="min-w-0 flex-1 basis-56 hover:text-accent-text">
                  <span className="block truncate text-sm font-medium">{String(r.values.description)}</span>
                  <span className="block text-xs text-muted">
                    <span className="font-mono">{r.id}</span> · {Number(r.values.count) || 0} tagihan · {String(r.values.date)}
                  </span>
                </Link>
                <span className="text-sm font-semibold tabular">{money(Number(r.values.total) || 0)}</span>
                <StateBadge type={type} status={r.status} />
                <Button size="sm" variant="card" onClick={() => download(r)}>
                  <Download aria-hidden className="size-4" /> File transfer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
