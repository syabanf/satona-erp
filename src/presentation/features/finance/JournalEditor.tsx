import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, CircleAlert, Plus, Trash2 } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { JOURNAL_SOURCES } from '@/domain/catalog/support'
import { journalBalance } from '@/domain/ledger'
import { canCreate } from '@/domain/records'
import { cn } from '@/lib/cn'
import { money } from '@/lib/format'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { ENTITY_NAME, recordPath } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { PageBar } from '../../ui/PageBar'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

const JOURNAL = typeOf('fin.journals')!
type Line = { key: number; account: string; costcenter: string; debit: number; credit: number; memo: string }
const blank = (key: number): Line => ({ key, account: '', costcenter: '', debit: 0, credit: 0, memo: '' })
const input = 'h-10 w-full min-w-0 rounded-xl border border-line-strong bg-card px-3 text-base text-fg outline-none focus:border-accent md:text-sm'

/**
 * Double-entry journal: a header and as many lines as needed, each on a posting account with a debit or a credit.
 * The totals update as you type and the journal saves only when debit equals credit. Saving creates the journal and
 * its lines as a draft; "Simpan dan ajukan" also sends it into the approval flow.
 */
export default function JournalEditor() {
  const { records, clock } = useServices()
  const { role } = useSession()
  const access = useAccess()(JOURNAL.module)
  const all = useAllRecords()
  const navigate = useNavigate()
  const toast = useToast()
  const [head, setHead] = useState({ description: '', entity: 'holding', date: clock.today(), reference: '' })
  const [lines, setLines] = useState<Line[]>([blank(1), blank(2)])
  const [nextKey, setNextKey] = useState(3)
  const [busy, setBusy] = useState<string | null>(null)

  if (!canCreate(JOURNAL, access)) return <EmptyState title={`${role.name} tidak bisa membuat jurnal`}>Akses Anda ke modul keuangan hanya baca.</EmptyState>
  if (!all.data) return <CardSkeleton lines={8} />
  const accounts = (all.data['mdm.accounts'] ?? []).filter((a) => a.values.postable === 'Yes' && a.status === 'active').sort((a, b) => String(a.values.code).localeCompare(String(b.values.code)))
  const centers = all.data['mdm.costcenters'] ?? []
  const edit = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const used = lines.filter((l) => l.account && (l.debit || l.credit))
  const { debit, credit, balanced } = journalBalance(used.map((l) => ({ values: l })))
  const ready = balanced && used.length >= 2 && head.description.trim() !== ''

  async function save(submit: boolean) {
    setBusy(submit ? 'submit' : 'draft')
    try {
      const journal = await records.create(role, JOURNAL.key, { ...head, source: JOURNAL_SOURCES[0], amount: debit })
      for (const l of used) await records.create(role, 'fin.journallines', { journal: journal.id, account: l.account, costcenter: l.costcenter, debit: l.debit, credit: l.credit, memo: l.memo || head.description })
      if (submit) await records.transition(role, JOURNAL.key, journal.id, 'submitted')
      toast({ title: `Jurnal ${journal.id} ${submit ? 'diajukan' : 'disimpan sebagai draf'}`, description: `${used.length} baris, ${money(debit)}.` })
      navigate(recordPath(JOURNAL, journal.id), { replace: true })
    } catch (e) {
      toast({ tone: 'danger', title: 'Jurnal tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageBar fallback={recordPath(JOURNAL)} label="Entri jurnal" />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium sm:col-span-2">
            Keterangan *
            <input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} placeholder="Misal: Akrual biaya angkut Oktober" className={cn(input, 'mt-1.5')} />
          </label>
          <label className="text-sm font-medium">
            Unit *
            <select value={head.entity} onChange={(e) => setHead({ ...head, entity: e.target.value })} className={cn(input, 'mt-1.5 cursor-pointer')}>
              {Object.entries(ENTITY_NAME).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Tanggal posting *
            <input type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} className={cn(input, 'mt-1.5')} />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Referensi
            <input value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} placeholder="Nomor dokumen sumber" className={cn(input, 'mt-1.5')} />
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Baris jurnal</h2>
          <Button
            variant="card"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setLines((ls) => [...ls, blank(nextKey)])
              setNextKey((k) => k + 1)
            }}
          >
            <Plus aria-hidden className="size-4" /> Tambah baris
          </Button>
        </div>
        <ul className="divide-y divide-line">
          <li aria-hidden className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9rem_9rem_minmax(0,1fr)_2.5rem] gap-2 pb-2 text-[11px] font-semibold tracking-wide text-muted uppercase lg:grid">
            <span>Akun</span>
            <span>Pusat biaya</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Kredit</span>
            <span>Memo</span>
            <span />
          </li>
          {lines.map((l, i) => (
            <li key={l.key} className="grid grid-cols-2 gap-2 py-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9rem_9rem_minmax(0,1fr)_2.5rem] lg:items-center">
              <select aria-label={`Akun baris ${i + 1}`} value={l.account} onChange={(e) => edit(l.key, { account: e.target.value })} className={cn(input, 'col-span-2 cursor-pointer lg:col-span-1')}>
                <option value="">Pilih akun</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {String(a.values.code)} {String(a.values.name)}
                  </option>
                ))}
              </select>
              <select aria-label={`Pusat biaya baris ${i + 1}`} value={l.costcenter} onChange={(e) => edit(l.key, { costcenter: e.target.value })} className={cn(input, 'col-span-2 cursor-pointer lg:col-span-1')}>
                <option value="">Tanpa pusat biaya</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.values.name)}
                  </option>
                ))}
              </select>
              {/* A line is a debit or a credit: typing one side clears the other. */}
              <input aria-label={`Debit baris ${i + 1}`} type="number" min={0} value={l.debit || ''} placeholder="Debit" onChange={(e) => edit(l.key, { debit: Math.max(0, Number(e.target.value) || 0), credit: 0 })} className={cn(input, 'tabular lg:text-right')} />
              <input aria-label={`Kredit baris ${i + 1}`} type="number" min={0} value={l.credit || ''} placeholder="Kredit" onChange={(e) => edit(l.key, { credit: Math.max(0, Number(e.target.value) || 0), debit: 0 })} className={cn(input, 'tabular lg:text-right')} />
              <input aria-label={`Memo baris ${i + 1}`} value={l.memo} onChange={(e) => edit(l.key, { memo: e.target.value })} placeholder="Memo" className={cn(input, 'lg:col-span-1')} />
              <button type="button" aria-label={`Hapus baris ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-10 cursor-pointer place-items-center justify-self-end rounded-full text-muted hover:bg-danger-soft hover:text-danger disabled:cursor-default disabled:opacity-30">
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-panel bg-raised p-4 text-sm">
          <span>
            Debit <span className="ml-1 font-semibold tabular">{money(debit)}</span>
          </span>
          <span>
            Kredit <span className="ml-1 font-semibold tabular">{money(credit)}</span>
          </span>
          <span role="status" className={cn('ml-auto inline-flex items-center gap-1.5 font-semibold', balanced ? 'text-success' : 'text-accent-text')}>
            {balanced ? <CheckCircle2 aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
            {balanced ? 'Seimbang' : debit || credit ? `Selisih ${money(Math.abs(debit - credit))}` : 'Isi minimal dua baris'}
          </span>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2 pb-4">
        <Button variant="ghost" onClick={() => navigate(recordPath(JOURNAL))}>
          Batal
        </Button>
        <Button variant="card" disabled={!ready} loading={busy === 'draft'} onClick={() => save(false)}>
          Simpan draf
        </Button>
        <Button variant="accent" disabled={!ready} loading={busy === 'submit'} onClick={() => save(true)}>
          Simpan dan ajukan
        </Button>
      </div>
    </div>
  )
}
