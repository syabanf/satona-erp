import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCheck } from 'lucide-react'
import { stateOf, type ErpRecord, type RecordType } from '@/domain/records'
import { isPendingApproval } from '@/domain/approval'
import { fieldLabel, moduleLabel, recordLabel } from '@/domain/uiLabels'
import { useAllRecords, useApprovalQueue } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { FilterChips } from '../../ui/FilterChips'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { StateBadge } from '../../records/StateBadge'
import { fieldText, recordPath, recordTitle, type AllRecords } from '../../records/text'

function keyDetails(type: RecordType, record: ErpRecord, all: AllRecords) {
  const chosen = [
    type.fields.find((field) => field.key === type.insight.sumField),
    ...type.fields.filter((field) => field.list && field.key !== type.titleField),
    ...type.fields.filter((field) => field.required && field.key !== type.titleField),
  ]
  return [...new Map(chosen.filter((field) => field && record.values[field.key] !== undefined).map((field) => [field!.key, field!])).values()]
    .slice(0, 2)
    .map((field) => ({ label: fieldLabel(field.label), value: fieldText(field, record.values[field.key], all) }))
}

const ACTION_LABELS: Record<string, string> = {
  Approve: 'Setujui', Reject: 'Tolak', 'Approve and release': 'Setujui dan terbitkan',
  Release: 'Terbitkan', Post: 'Catat', 'Sign off': 'Sahkan', Accept: 'Terima',
}

const actionLabel = (label: string) => ACTION_LABELS[label] ?? label

/** The approver's inbox: every record whose next step needs this role's approval, with the step one click away. */
export default function ApprovalsPage() {
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const all = useAllRecords()
  const queue = useApprovalQueue()
  const [section, setSection] = useState<'pending' | 'other'>('pending')
  const pending = queue.filter(isPendingApproval)
  const other = queue.filter((item) => !isPendingApproval(item))
  const items = section === 'pending' ? pending : other
  const [module, setModule] = useState<string>()
  const [visible, setVisible] = useState(10)
  const [busy, setBusy] = useState<string | null>(null)
  const [decision, setDecision] = useState<{ typeKey: string; id: string; to: string; label: string; title: string; next: string } | null>(null)

  if (!all.data) return <CardSkeleton lines={8} />
  const allData = all.data
  const modules = [...new Set(items.map((i) => i.type.module))]
  const shown = items.filter((i) => !module || i.type.module === module)
  const counts = Object.fromEntries(modules.map((m) => [m, items.filter((i) => i.type.module === m).length]))

  async function act(typeKey: string, id: string, to: string, label: string) {
    setBusy(`${id}-${to}`)
    try {
      await records.transition(role, typeKey, id, to)
      toast({ title: `${id}: ${actionLabel(label).toLowerCase()} selesai` })
      setDecision(null)
    } catch (e) {
      toast({ tone: 'danger', title: 'Belum berhasil diubah', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <p className="text-sm">
          <span className="font-semibold">{pending.length}</span> <span className="text-muted">pengajuan menunggu keputusan Anda</span>
        </p>
        <p className="w-full text-xs text-muted">Baca rincian sebelum memutuskan. Perubahan hanya berlaku pada data demo.</p>
        {other.length > 0 && (
          <div role="group" aria-label="Jenis tugas" className="flex gap-1.5">
            <Button size="sm" variant={section === 'pending' ? 'solid' : 'soft'} aria-pressed={section === 'pending'} onClick={() => { setSection('pending'); setModule(undefined); setVisible(10) }}>Persetujuan</Button>
            <Button size="sm" variant={section === 'other' ? 'solid' : 'soft'} aria-pressed={section === 'other'} onClick={() => { setSection('other'); setModule(undefined); setVisible(10) }}>Tugas lain {other.length}</Button>
          </div>
        )}
        {modules.length > 1 && (
          <FilterChips label="Saring menurut bagian" options={modules.map((m) => ({ value: m, label: moduleLabel(m) }))} value={module} counts={counts} total={items.length} onChange={(value) => { setModule(value); setVisible(10) }} className="w-full flex-none" />
        )}
      </div>
      {shown.length === 0 ? (
        <div className="p-6">
          <EmptyState title={section === 'pending' ? 'Belum ada yang perlu disetujui' : 'Belum ada tugas lain'} action={<Link to="/modules" className="text-sm font-semibold underline">Lihat modul</Link>}>
            <span className="inline-flex items-center gap-1.5">
              <CheckCheck aria-hidden className="size-4" /> {section === 'pending' ? 'Pilih peran penyetuju untuk melihat pengajuannya.' : 'Tidak ada tindakan lanjutan untuk peran ini.'}
            </span>
          </EmptyState>
        </div>
      ) : (
        <ul data-tour="approvals-list" className="divide-y divide-line">
          {shown.slice(0, visible).map(({ type, record, moves, step, levels }) => (
            <li key={`${type.key}-${record.id}`} data-motion="row" className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-64">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded bg-raised px-1.5 py-0.5 font-semibold text-fg">{moduleLabel(type.module)}</span>
                  {recordLabel(type.key, type.singular.toLowerCase())} <span className="font-mono">{record.id}</span>
                  {step && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-text">
                      Tahap {step.level} dari {levels}
                    </span>
                  )}
                </span>
                <Link to={recordPath(type, record.id)} className="mt-1 block text-sm font-semibold hover:underline">{recordTitle(type, record, allData)}</Link>
                <p className="mt-1 text-xs text-muted">{record.history[0]?.by === 'Data migration' ? 'Data contoh' : `Dibuat oleh ${record.history[0]?.by ?? 'pengguna'}`} · Diperbarui {new Date(record.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <StateBadge type={type} status={record.status} />
              </div>
              {keyDetails(type, record, allData).length > 0 && (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {keyDetails(type, record, allData).map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-raised px-3 py-2">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-0.5 text-sm font-medium break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link to={recordPath(type, record.id)} className="w-full text-sm font-semibold text-accent-text hover:underline sm:mr-auto sm:w-auto">Baca rincian →</Link>
                <div className="flex flex-wrap gap-2">
                  {moves.map((m) => (
                    <Button key={m.to} size="sm" variant={stateOf(type, m.to)?.tone === 'danger' ? 'soft' : 'solid'} onClick={() => setDecision({ typeKey: type.key, id: record.id, to: m.to, label: m.label, title: recordTitle(type, record, allData), next: stateOf(type, m.to)?.label ?? m.to })}>
                      {actionLabel(m.label)}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
          {shown.length > visible && (
            <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-muted">
              <span>Menampilkan {visible} dari {shown.length}. Saring menurut bagian untuk mencari pengajuan.</span>
              <Button size="sm" variant="soft" onClick={() => setVisible((count) => count + 10)}>Tampilkan 10 lagi</Button>
            </li>
          )}
        </ul>
      )}
    </Card>
    <ConfirmDialog open={Boolean(decision)} title={`Yakin ingin ${actionLabel(decision?.label ?? '').toLowerCase()}?`} confirm={actionLabel(decision?.label ?? 'Lanjut')} busy={Boolean(busy)} onClose={() => setDecision(null)} onConfirm={() => decision && act(decision.typeKey, decision.id, decision.to, decision.label)}>
      <span className="block font-medium text-fg">{decision?.title}</span>
      <span className="mt-1 block">Status {decision?.id} akan berubah menjadi {decision?.next}. Perubahan tersimpan di data demo.</span>
    </ConfirmDialog>
    </>
  )
}
