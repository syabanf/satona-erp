import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Landmark, Plus } from 'lucide-react'
import { bankOnlyPosting, bankReconciliation, matchSuggestions } from '@/domain/bank'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { money } from '@/lib/format'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

/**
 * Bank reconciliation: the statement of a house bank against its ledger account. Each unmatched line comes with the
 * journal that moved the same amount within five days; charges and interest only the bank knows about book in one click.
 */
export default function BankPage() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const banks = (all.data?.['mdm.banks'] ?? []).filter((b) => (all.data?.['fin.statementlines'] ?? []).some((l) => l.values.bank === b.id))
  const [bankId, setBankId] = useState('')
  if (!all.data) return <CardSkeleton lines={8} />
  const bank = banks.find((b) => b.id === bankId) ?? banks[0]
  if (!bank) return <EmptyState title="Belum ada rekening koran">Impor rekening koran ke baris rekening koran untuk mulai mencocokkan.</EmptyState>
  const data = all.data
  const rec = bankReconciliation(data, bank.id)
  const suggestions = matchSuggestions(data, bank.id)

  const run = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await work()
      toast({ title: done })
    } catch (e) {
      toast({ tone: 'danger', title: 'Tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }
  const match = async (line: ErpRecord, journal: string) => {
    await records.update(role, line.type, line.id, { ...line.values, journal })
    await records.transition(role, line.type, line.id, 'matched')
  }
  const matchAll = () => run('all', async () => {
    for (const s of suggestions) if (s.journal) await match(s.line, s.journal.id)
  }, `${suggestions.filter((s) => s.journal).length} baris dicocokkan`)

  const tile = (label: string, value: string, tone?: string) => (
    <div className="rounded-panel bg-raised p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular', tone)}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`${String(bank.values.name)} ${String(bank.values.account)}`}
          icon={<Landmark aria-hidden className="size-5 text-muted" />}
          action={
            banks.length > 1 && (
              <select value={bank.id} onChange={(e) => setBankId(e.target.value)} aria-label="Rekening bank" className="h-9 cursor-pointer rounded-full border border-line-strong bg-card px-3 text-sm">
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{`${String(b.values.name)} ${String(b.values.account)}`}</option>
                ))}
              </select>
            )
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tile(`Mutasi rekening koran sejak ${rec.since}`, money(rec.statement))}
          {tile('Mutasi buku besar periode yang sama', money(rec.ledger))}
          {tile('Selisih', money(rec.difference), rec.difference ? 'text-accent-text' : 'text-success')}
          {tile('Baris cocok', `${rec.matched} dari ${rec.matched + rec.unmatched}`)}
        </div>
        <p className="mt-3 text-xs text-muted">Selisih berasal dari baris yang belum dicocokkan: transaksi yang belum tercatat di buku, atau jurnal yang belum muncul di bank.</p>
      </Card>

      <Card>
        <CardHeader
          title="Belum dicocokkan"
          action={
            <Button size="sm" variant="accent" disabled={!suggestions.some((s) => s.journal)} loading={busy === 'all'} onClick={matchAll}>
              <Check aria-hidden className="size-4" /> Cocokkan semua saran
            </Button>
          }
        />
        {suggestions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Semua baris rekening koran sudah cocok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {suggestions.map(({ line, journal }) => {
              const amount = Number(line.values.amount)
              const bookable = !journal && bankOnlyPosting(data, line, clock.today())
              return (
                <li key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate text-sm font-medium">{String(line.values.description)}</span>
                    <span className="block text-xs text-muted">
                      {String(line.values.date)} · <span className="font-mono">{line.id}</span>
                      {journal && (
                        <>
                          {' '}· cocok dengan{' '}
                          <Link to={`/modules/fin/journals/${journal.id}`} className="font-mono text-accent-text hover:underline">{journal.id}</Link> {String(journal.values.description)}
                        </>
                      )}
                    </span>
                  </span>
                  <span className={cn('w-36 text-right text-sm font-semibold tabular', amount < 0 ? 'text-body' : 'text-success')}>{money(amount)}</span>
                  {journal ? (
                    <Button size="sm" variant="card" loading={busy === line.id} onClick={() => run(line.id, () => match(line, journal.id), `${line.id} cocok dengan ${journal.id}`)}>
                      <Check aria-hidden className="size-4" /> Cocokkan
                    </Button>
                  ) : bookable ? (
                    <Button
                      size="sm"
                      variant="card"
                      loading={busy === line.id}
                      onClick={() => run(line.id, async () => match(line, (await records.post(role, bookable)).id), `${line.id} dibukukan dan dicocokkan`)}
                    >
                      <Plus aria-hidden className="size-4" /> {amount < 0 ? 'Bukukan biaya bank' : 'Bukukan pendapatan lain'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Telusuri sumbernya, lalu buat jurnal</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
