import { useState } from 'react'
import { Send } from 'lucide-react'
import type { ErpRecord } from '@/domain/records'
import { ownRecords, type SelfItem } from '@/domain/selfService'
import { cn } from '@/lib/cn'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { refTitle, type AllRecords } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { useToast } from '../../ui/useToast'
import { OwnRecords } from './OwnRecords'

const RELATION: Record<string, string> = { Self: 'Diri sendiri', Manager: 'Sebagai atasan', Peer: 'Sebagai rekan', 'Direct report': 'Sebagai bawahan' }

/** The 360 reviews waiting for the employee: a score from 1 to 5 and a comment each, then every review they handed in. */
export function Feedback({ item, all, me }: { item: SelfItem; all: AllRecords; me: ErpRecord }) {
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, { score: number; comment: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const waiting = ownRecords(all['hrs.feedback360'] ?? [], me.id).filter((f) => f.status === 'pending')

  const send = async (f: ErpRecord) => {
    setBusy(f.id)
    try {
      await records.updateOwn(role, f.type, f.id, draft[f.id]!, 'submitted')
      toast({ title: `Penilaian ${f.id} terkirim` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Penilaian tidak terkirim', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {waiting.map((f) => {
        const d = draft[f.id] ?? { score: 0, comment: '' }
        const set = (patch: Partial<typeof d>) => setDraft({ ...draft, [f.id]: { ...d, ...patch } })
        return (
          <Card key={f.id} className="space-y-3">
            <div>
              <p className="font-semibold">{refTitle('mdm.employees', String(f.values.subject), all).split(' · ')[0]}</p>
              <p className="text-xs text-muted">
                {RELATION[String(f.values.relation)]} · <span className="font-mono">{f.id}</span>
              </p>
            </div>
            <div role="radiogroup" aria-label="Skor" className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={d.score === n} onClick={() => set({ score: n })} className={cn('grid size-11 cursor-pointer place-items-center rounded-full border text-sm font-semibold transition-colors', d.score === n ? 'border-transparent bg-invert text-on-invert' : 'border-line-strong bg-raised hover:bg-control')}>
                  {n}
                </button>
              ))}
            </div>
            <textarea value={d.comment} onChange={(e) => set({ comment: e.target.value })} rows={2} placeholder="Apa yang sudah baik, dan apa yang perlu ditingkatkan" aria-label="Komentar" className="w-full rounded-panel border border-line-strong bg-raised px-4 py-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:text-sm" />
            <Button variant="accent" size="sm" disabled={!d.score} loading={busy === f.id} onClick={() => send(f)}>
              <Send aria-hidden className="size-4" /> Kirim penilaian
            </Button>
          </Card>
        )
      })}
      <OwnRecords item={item} all={all} me={me} />
    </div>
  )
}
