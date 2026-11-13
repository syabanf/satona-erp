import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, LayoutGrid, Plus, X } from 'lucide-react'
import type { ErpRecord } from '@/domain/records'
import { useAllRecords, useApprovals } from '../../hooks/useRecords'
import { useSession } from '../../hooks/useSession'
import { useStored } from '../../hooks/useStored'
import { Button } from '../../ui/Button'
import { KpiTile } from '../mes/KpiTile'

type All = Readonly<Record<string, readonly ErpRecord[]>>
interface Tile {
  id: string
  label: string
  to: string
  note: string
  value: (all: All, approvals: number) => number
  format?: (v: number) => string
}

const count = (all: All, key: string, keep: (r: ErpRecord) => boolean) => (all[key] ?? []).filter(keep).length
const not = (...states: string[]) => (r: ErpRecord) => !states.includes(r.status)

/** Every tile a person can put on their dashboard, each opening the list behind its number. */
const CATALOGUE: readonly Tile[] = [
  { id: 'approvals', label: 'Persetujuan menunggu', to: '/approvals', note: 'menunggu keputusan Anda', value: (_all, a) => a },
  { id: 'wo', label: 'Work order terbuka', to: '/modules/eam/workorders?status=open', note: 'perawatan belum selesai', value: (all) => count(all, 'eam.workorders', not('completed', 'verified', 'closed', 'cancelled')) },
  { id: 'oee', label: 'OEE rata-rata', to: '/modules/mes/oee', note: 'semua work centre', value: (all) => { const r = all['mes.oee'] ?? []; return r.length ? r.reduce((s, x) => s + (Number(x.values.oee) || 0), 0) / r.length : 0 }, format: (v) => `${v.toFixed(1)}%` },
  { id: 'alarms', label: 'Alarm terbuka', to: '/modules/occ/alarms?status=new', note: 'pusat operasi', value: (all) => count(all, 'occ.alarms', not('resolved', 'closed')) },
  { id: 'devices', label: 'Perangkat online', to: '/devices', note: 'IoT dan OT', value: (all) => { const d = (all['dvm.devices'] ?? []).filter((x) => x.status !== 'retired'); return d.length ? (d.filter((x) => x.status === 'online').length / d.length) * 100 : 0 }, format: (v) => `${Math.round(v)}%` },
  { id: 'parts', label: 'Suku cadang di bawah minimum', to: '/modules/eam/parts', note: 'perlu dipesan', value: (all) => count(all, 'eam.parts', (r) => r.values.reorder === 'Yes') },
  { id: 'trips', label: 'Perjalanan berjalan', to: '/modules/tms/trips?status=transit', note: 'armada di jalan', value: (all) => count(all, 'tms.trips', (r) => r.status === 'dispatched' || r.status === 'transit') },
  { id: 'incidents', label: 'Insiden K3 terbuka', to: '/modules/she/incidents', note: 'belum ditutup', value: (all) => count(all, 'she.incidents', not('closed')) },
  { id: 'overdue', label: 'Piutang jatuh tempo', to: '/modules/fin/receivables?status=overdue', note: 'invoice pelanggan', value: (all) => count(all, 'fin.receivables', (r) => r.status === 'overdue') },
  { id: 'pr', label: 'Permintaan pembelian', to: '/modules/vms/requisitions', note: 'belum jadi PO', value: (all) => count(all, 'vms.requisitions', not('approved', 'rejected', 'converted', 'closed')) },
]

/** The tiles each role picks for its own dashboard, in its own order, kept on this device. */
export function MyTiles() {
  const { role } = useSession()
  const all = useAllRecords()
  const approvals = useApprovals().length
  const [ids, setIds] = useStored<string[]>(`wit-tiles:${role.id}`, ['approvals', 'wo', 'oee', 'devices'])
  const [editing, setEditing] = useState(false)
  if (!all.data) return null
  const data = all.data
  const chosen = ids.map((id) => CATALOGUE.find((t) => t.id === id)).filter((t): t is Tile => !!t)
  const move = (i: number, by: number) => {
    const next = [...ids]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x!)
    setIds(next)
  }

  return (
    <section aria-labelledby="my-tiles" className="mb-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="my-tiles" className="text-lg font-semibold">Tile saya</h2>
        <Button variant={editing ? 'solid' : 'card'} size="sm" className="ml-auto" onClick={() => setEditing(!editing)}>
          {editing ? <Check aria-hidden className="size-4" /> : <LayoutGrid aria-hidden className="size-4" />} {editing ? 'Selesai' : 'Atur tile'}
        </Button>
      </div>
      {chosen.length === 0 && !editing && <p className="text-sm text-muted">Belum ada tile. Klik Atur tile untuk memilih angka yang ingin Anda pantau.</p>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {chosen.map((t, i) => (
          <div key={t.id} className="relative">
            <KpiTile label={t.label} value={t.value(data, approvals)} format={t.format ?? ((v) => String(Math.round(v)))} to={t.to} note={t.note} accent={i === 0} />
            {editing && (
              <span className="absolute top-2 right-2 flex gap-1">
                <Button size="icon-sm" variant="card" aria-label={`Geser ${t.label} ke kiri`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp aria-hidden className="size-3.5 -rotate-90" />
                </Button>
                <Button size="icon-sm" variant="card" aria-label={`Geser ${t.label} ke kanan`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown aria-hidden className="size-3.5 -rotate-90" />
                </Button>
                <Button size="icon-sm" variant="card" aria-label={`Hapus ${t.label}`} onClick={() => setIds(ids.filter((x) => x !== t.id))}>
                  <X aria-hidden className="size-3.5" />
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <div className="flex flex-wrap gap-2 rounded-panel bg-raised p-3">
          {CATALOGUE.filter((t) => !ids.includes(t.id)).map((t) => (
            <button key={t.id} type="button" onClick={() => setIds([...ids, t.id])} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-medium hover:border-accent">
              <Plus aria-hidden className="size-3.5" /> {t.label}
            </button>
          ))}
          {CATALOGUE.every((t) => ids.includes(t.id)) && <span className="text-xs text-muted">Semua tile sudah dipakai.</span>}
        </div>
      )}
    </section>
  )
}
