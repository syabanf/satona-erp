import { useState } from 'react'
import { Link } from 'react-router'
import { Gauge, PackageSearch } from 'lucide-react'
import { capacityLoad, mrpRun } from '@/domain/plant'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'

const HORIZONS = [7, 14, 30]

/**
 * The MRP run: what the production orders planned in the horizon need from each material, against stock, open
 * purchase orders and open requisitions. One button raises a requisition for every shortage.
 */
export default function MrpPage() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [horizon, setHorizon] = useState(14)
  const [busy, setBusy] = useState(false)
  if (!all.data) return <CardSkeleton lines={8} />
  const rows = mrpRun(all.data, clock.today(), horizon)
  const short = rows.filter((r) => r.requisition)
  const load = capacityLoad(all.data, clock.today(), 4)
  const lines = [...new Set(load.map((r) => r.line))]

  const raise = async () => {
    setBusy(true)
    try {
      toast({ title: `${await records.createMany(role, 'vms.requisitions', short.map((r) => r.requisition!))} permintaan pembelian dibuat`, description: 'Statusnya draf; ajukan dari daftar permintaan pembelian.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Permintaan tidak dibuat', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const num = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 })

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader
        title="Kebutuhan bahan"
        icon={<PackageSearch aria-hidden className="size-5 text-muted" />}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Horizon" className="h-9 cursor-pointer rounded-full border border-line-strong bg-card px-3 text-sm">
              {HORIZONS.map((h) => (
                <option key={h} value={h}>{`${h} hari ke depan`}</option>
              ))}
            </select>
            <Button size="sm" variant="accent" disabled={!short.length} loading={busy} onClick={raise}>
              Buat {short.length} permintaan pembelian
            </Button>
          </span>
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Tidak ada order produksi terencana dalam horizon ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-muted">
                {['Bahan', 'Butuh', 'Stok', 'Dalam PO', 'Dalam PR', 'Kurang', 'Butuh mulai'].map((c, i) => (
                  <th key={c} className={cn('px-2 py-2 font-medium', i > 0 && i < 6 && 'text-right')}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.material} className="border-b border-line">
                  <td className="px-2 py-2">
                    <Link to={`/modules/mdm/materials/${r.material}`} className="font-medium hover:text-accent-text hover:underline">{r.name}</Link>
                    <span className="block text-xs text-muted">{r.orders} batch</span>
                  </td>
                  {[r.need, r.onHand, r.onOrder, r.requested].map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular">{num(v)}</td>
                  ))}
                  <td className={cn('px-2 py-2 text-right font-semibold tabular', r.shortage ? 'text-accent-text' : 'text-success')}>{r.shortage ? num(r.shortage) : 'Cukup'}</td>
                  <td className="px-2 py-2 tabular">{r.first}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Kebutuhan dihitung dari BOM formula tiap order termasuk scrap. Bahan yang sudah ada dalam PO atau PR terbuka tidak diusulkan lagi.</p>
    </Card>
    <Card>
      <CardHeader title="Beban kapasitas lini, 4 minggu" icon={<Gauge aria-hidden className="size-5 text-muted" />} />
      <div className="space-y-4">
        {lines.map((line) => (
          <div key={line}>
            <p className="text-sm font-medium">
              {line} <span className="font-normal text-muted">· {num(load.find((r) => r.line === line)!.capacity)} t per minggu, dibatasi {load.find((r) => r.line === line)!.bottleneck}</span>
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-4">
              {load.filter((r) => r.line === line).map((r) => (
                <li key={r.from} className="rounded-panel bg-raised p-3">
                  <p className="text-xs text-muted tabular">{r.from}</p>
                  <p className={cn('mt-1 text-sm font-semibold tabular', r.over > 0 && 'text-accent-text')}>{num(r.load)} t · {Math.round((r.load / r.capacity) * 100)}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-control">
                    <div className={cn('h-full rounded-full', r.over ? 'bg-accent' : 'bg-invert')} style={{ width: `${Math.min(100, (r.load / r.capacity) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{r.orders} order{r.over ? ` · lebih ${num(r.over)} t` : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Kapasitas mingguan: laju work centre paling lambat di lini, kali 8 jam, shift per hari, 7 hari dan efisiensi 85%. Order tidak bisa dirilis ke minggu yang sudah penuh.</p>
    </Card>
    </div>
  )
}
