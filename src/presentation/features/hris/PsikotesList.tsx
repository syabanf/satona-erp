import { Link } from 'react-router'
import { Brain } from 'lucide-react'
import { INSTRUMENTS } from '@/domain/assessments'
import { typeOf } from '@/domain/catalog'
import { useAllRecords } from '../../hooks/useRecords'
import { StateBadge } from '../../records/StateBadge'
import { refTitle } from '../../records/text'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'

const TYPE = typeOf('hrs.psikotes')!
const ORDER = ['in_progress', 'pending', 'done', 'reviewed']

/** Every candidate's psychometric tests, open ones first, each with the button that opens its test screen. */
export default function PsikotesList() {
  const all = useAllRecords()
  if (!all.data) return <CardSkeleton lines={8} />
  const data = all.data
  const tests = (data[TYPE.key] ?? []).toSorted((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.id.localeCompare(b.id))
  return (
    <Card>
      <CardHeader title="Psikotes kandidat" icon={<Brain aria-hidden className="size-5 text-muted" />} />
      <ul className="divide-y divide-line">
        {tests.map((t) => {
          const open = ['pending', 'in_progress'].includes(t.status)
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="min-w-0 flex-1 basis-56">
                <span className="block truncate text-sm font-medium">{refTitle('hrs.candidates', String(t.values.candidate), data).split(' · ')[0]}</span>
                <span className="block text-xs text-muted">
                  {String(t.values.instrument)} · {INSTRUMENTS[String(t.values.instrument)]?.kind === 'drawing' ? 'tes gambar' : 'tes pilihan'} · <span className="font-mono">{t.id}</span>
                </span>
              </span>
              {t.values.score !== undefined && t.values.score !== '' && <span className="text-sm font-semibold tabular">{String(t.values.score)}</span>}
              <StateBadge type={TYPE} status={t.status} />
              <Link to={`/hris/psikotes/${t.id}`} className={buttonStyles({ variant: open ? 'accent' : 'card', size: 'sm' })}>
                {t.status === 'pending' ? 'Mulai tes' : t.status === 'in_progress' ? 'Lanjutkan' : 'Lihat hasil'}
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
