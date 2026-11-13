import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BellRing, PackageMinus, Play, Wrench } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { useAutomation, type Rule } from '../../hooks/useAutomation'
import { recordPath } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/useToast'

function RuleCard({ rule, icon, title, body, count, children, onRun, auto, onAuto }: { rule: Rule; icon: ReactNode; title: string; body: string; count: number; children: ReactNode; onRun: () => Promise<void>; auto: boolean; onAuto: (on: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">{icon}</span>
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{body}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch checked={auto} onChange={onAuto} label={`Jalankan ${title} otomatis`} /> Otomatis
          </label>
          <Button
            size="sm"
            variant="accent"
            disabled={count === 0}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await onRun()
              setBusy(false)
            }}
            data-rule={rule}
          >
            <Play aria-hidden className="size-4" /> Jalankan sekarang ({count})
          </Button>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  )
}

/**
 * Automation: three rules that turn data into work. PM plans that come due by date or meter raise preventive work orders,
 * spare parts at their minimum raise purchase requisitions, and approvals waiting three days or more get a reminder.
 */
export default function AutomationPage() {
  const { pending, run, auto, toggle } = useAutomation()
  const toast = useToast()
  if (!pending) return <CardSkeleton lines={8} />
  const go = (rule: Rule, what: string) => async () => {
    const { done, failed } = await run(rule)
    toast(failed ? { tone: 'danger', title: `${done} ${what}, ${failed} gagal`, description: 'Peran Anda mungkin tidak punya akses ke modul tujuan.' } : { title: `${done} ${what}` })
  }
  const empty = (text: string) => <p className="rounded-panel bg-raised p-4 text-sm text-muted">{text}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Nyalakan Otomatis agar aturan berjalan sekali setiap sesi saat dashboard dibuka. Setiap hasil tercatat di riwayat data sumbernya.</p>
      <RuleCard rule="pm" icon={<Wrench className="size-5" />} title="PM menjadi work order" body="Rencana perawatan yang jatuh tempo menurut kalender atau jam jalan dibuatkan work order preventif." count={pending.pm.length} onRun={go('pm', 'work order dibuat')} auto={auto.pm} onAuto={(on) => toggle('pm', on)}>
        {pending.pm.length === 0 ? empty('Tidak ada rencana yang jatuh tempo tanpa work order.') : (
          <ul className="divide-y divide-line">
            {pending.pm.map((p) => (
              <li key={p.plan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Link to={recordPath(typeOf('eam.plans')!, p.plan.id)} className="font-mono text-xs hover:underline">{p.plan.id}</Link>
                <span className="min-w-0 flex-1 truncate">{String(p.plan.values.task)}</span>
                <span className="text-xs text-accent-text">{p.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </RuleCard>
      <RuleCard rule="stock" icon={<PackageMinus className="size-5" />} title="Stok minimum menjadi permintaan pembelian" body="Suku cadang di atau di bawah stok minimum dibuatkan purchase requisition untuk dua kali stok minimum." count={pending.stock.length} onRun={go('stock', 'permintaan pembelian dibuat')} auto={auto.stock} onAuto={(on) => toggle('stock', on)}>
        {pending.stock.length === 0 ? empty('Semua suku cadang di atas stok minimum atau sudah dipesan.') : (
          <ul className="divide-y divide-line">
            {pending.stock.map((s) => (
              <li key={s.part.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Link to={recordPath(typeOf('eam.parts')!, s.part.id)} className="font-mono text-xs hover:underline">{String(s.part.values.partNo)}</Link>
                <span className="min-w-0 flex-1 truncate">{String(s.part.values.name)}</span>
                <span className="text-xs text-muted tabular">{String(s.part.values.onHand)} / min {String(s.part.values.minStock)} · pesan {s.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </RuleCard>
      <RuleCard rule="remind" icon={<BellRing className="size-5" />} title="Pengingat persetujuan" body="Dokumen yang menunggu persetujuan 3 hari atau lebih mendapat pengingat di riwayatnya (20 tertua per jalan)." count={pending.remind.length} onRun={go('remind', 'pengingat dikirim')} auto={auto.remind} onAuto={(on) => toggle('remind', on)}>
        {pending.remind.length === 0 ? empty('Tidak ada persetujuan yang tertahan.') : (
          <ul className="divide-y divide-line">
            {pending.remind.slice(0, 8).map((s) => (
              <li key={`${s.type.key}-${s.record.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Link to={recordPath(s.type, s.record.id)} className="font-mono text-xs hover:underline">{s.record.id}</Link>
                <span className="min-w-0 flex-1 truncate">{s.type.singular}</span>
                <span className="text-xs text-accent-text tabular">{s.days} hari menunggu</span>
              </li>
            ))}
            {pending.remind.length > 8 && <li className="py-2 text-xs text-muted">dan {pending.remind.length - 8} lainnya</li>}
          </ul>
        )}
      </RuleCard>
    </div>
  )
}
