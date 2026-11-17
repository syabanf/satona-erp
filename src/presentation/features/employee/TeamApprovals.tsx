import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import type { ErpRecord } from '@/domain/records'
import { isSupervisor, teamRequests } from '@/domain/selfService'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { fieldText, recordTitle, refTitle, type AllRecords } from '../../records/text'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

/** Leave, overtime and shift-swap requests of the supervisor's own team, decided here without the back office. */
export function TeamApprovals({ all, me }: { all: AllRecords; me: ErpRecord }) {
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  if (!isSupervisor(role)) return <EmptyState title="Halaman ini untuk atasan">Peran {role.name} tidak memimpin tim.</EmptyState>
  const waiting = teamRequests(all, me)
  if (!waiting.length) return <EmptyState title="Tidak ada pengajuan tim yang menunggu">Cuti, lembur dan tukar shift anggota tim muncul di sini.</EmptyState>

  const decide = async (typeKey: string, record: ErpRecord, to: 'approved' | 'rejected') => {
    setBusy(`${record.id}:${to}`)
    try {
      await records.decideTeam(role, typeKey, record.id, to)
      toast({ title: `${record.id} ${to === 'approved' ? 'disetujui' : 'ditolak'}` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Keputusan tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="space-y-3">
      {waiting.map(({ type: typeKey, record }) => {
        const type = typeOf(typeKey)!
        const name = refTitle('mdm.employees', String(record.values.employee), all).split(' · ')[0]!
        return (
          <li key={record.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-4 shadow-card">
            <Avatar name={name} />
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold">
                {name} <span className="font-normal text-muted">· {type.singular}</span>
              </p>
              <p className="text-sm">{recordTitle(type, record, all)}</p>
              <p className="text-xs text-muted">
                {type.fields.filter((f) => f.list && f.key !== 'employee').map((f) => `${f.label}: ${fieldText(f, record.values[f.key], all)}`).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="card" loading={busy === `${record.id}:rejected`} onClick={() => decide(typeKey, record, 'rejected')}>
                <X aria-hidden className="size-4" /> Tolak
              </Button>
              <Button size="sm" variant="accent" loading={busy === `${record.id}:approved`} onClick={() => decide(typeKey, record, 'approved')}>
                <Check aria-hidden className="size-4" /> Setujui
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
