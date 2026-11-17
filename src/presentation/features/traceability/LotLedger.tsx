import { Link, useSearchParams } from 'react-router'
import { ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react'
import type { ErpRecord } from '@/domain/records'
import { traceLot } from '@/domain/plant'
import { useAllRecords } from '../../hooks/useRecords'
import { refTitle, type AllRecords } from '../../records/text'
import { StatusPill } from '../../ui/Badge'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'

const KIND = { Receipt: ['Penerimaan', 'info'], Consumption: ['Pemakaian', 'warning'], Production: ['Produksi', 'success'], Shipment: ['Pengiriman', 'neutral'] } as const
/** Where a movement's document lives, by its number prefix. */
const DOC_PATH: Record<string, string> = { GRN: '/modules/vms/receipts', PRD: '/modules/bpf/orders', SO: '/modules/dms/orders' }

function Movements({ rows, all, empty }: { rows: readonly ErpRecord[]; all: AllRecords; empty: string }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {rows.map((m) => {
        const [label, tone] = KIND[String(m.values.kind) as keyof typeof KIND] ?? [String(m.values.kind), 'neutral']
        const doc = String(m.values.document)
        const path = DOC_PATH[doc.split('-')[0] ?? '']
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
            <StatusPill tone={tone}>{label}</StatusPill>
            <Link to={`/traceability/ledger?q=${encodeURIComponent(String(m.values.lotNo))}`} className="font-mono text-xs hover:text-accent-text hover:underline">{String(m.values.lotNo)}</Link>
            <span className="min-w-0 flex-1 basis-40 truncate">{refTitle('mdm.materials', String(m.values.material), all).split(' · ')[0]}</span>
            <span className="tabular">{Number(m.values.qty).toLocaleString('id-ID')} t</span>
            {path ? <Link to={`${path}/${doc}`} className="font-mono text-xs text-accent-text hover:underline">{doc}</Link> : <span className="font-mono text-xs">{doc}</span>}
            <span className="text-xs text-muted tabular">{String(m.values.date)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Lot trace: type a lot number or a document number to see every movement that names it, the raw-material lots a
 * finished lot was made from, and the shipments a raw-material lot ended up in.
 */
export default function LotLedger() {
  const all = useAllRecords()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  if (!all.data) return <CardSkeleton lines={8} />
  const trace = traceLot(all.data, q)
  const recent = (all.data['gtr.movements'] ?? []).toSorted((a, b) => String(b.values.date).localeCompare(String(a.values.date))).slice(0, 12)

  return (
    <div className="space-y-4">
      <label className="flex h-12 items-center gap-3 rounded-full border border-line-strong bg-card px-4 shadow-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <input value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder="Nomor lot atau dokumen, misalnya FG-PRD-0022 atau GRN-0031" aria-label="Cari lot atau dokumen" className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" />
      </label>
      {q ? (
        <>
          <Card>
            <CardHeader title={`Mutasi ${q}`} />
            <Movements rows={trace.movements} all={all.data} empty="Tidak ada mutasi dengan nomor ini." />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Asal: lot bahan yang dipakai" icon={<ArrowDownToLine aria-hidden className="size-5 text-muted" />} />
              <Movements rows={trace.sources} all={all.data} empty="Bukan lot barang jadi, atau bahannya belum ber-lot." />
            </Card>
            <Card>
              <CardHeader title="Tujuan: pengiriman barang jadinya" icon={<ArrowUpFromLine aria-hidden className="size-5 text-muted" />} />
              <Movements rows={trace.destinations} all={all.data} empty="Belum ada pengiriman dari lot ini." />
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader title="Mutasi lot terbaru" />
          <Movements rows={recent} all={all.data} empty="Belum ada mutasi lot." />
        </Card>
      )}
    </div>
  )
}
