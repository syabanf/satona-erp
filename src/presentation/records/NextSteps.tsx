import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { conversionsFor } from '@/domain/conversions'
import { canCreate, type ErpRecord, type RecordType } from '@/domain/records'
import { useAccess } from '../hooks/useRecords'
import { useServices } from '../hooks/useServices'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { useRecordDrawer } from './drawer'
import { StateBadge } from './StateBadge'
import { recordPath, type AllRecords } from './text'

/** The documents this record can turn into next, prefilled from it, with the ones it already produced. */
export function NextSteps({ type, record, all }: { type: RecordType; record: ErpRecord; all: AllRecords }) {
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const { clock } = useServices()
  const steps = conversionsFor(type.key, record, all)
  if (!steps.length) return null
  return (
    <Card>
      <CardHeader title="Langkah berikutnya" action={<span className="text-xs text-muted">dokumen baru terisi dari {record.id}</span>} />
      <ul className="space-y-3">
        {steps.map((s) => {
          const target = typeOf(s.to)!
          return (
            <li key={s.to} className="rounded-panel bg-raised p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-xs text-muted">{target.singular} · {target.name}</span>
                </span>
                {canCreate(target, accessFor(target.module)) && (
                  <Button size="sm" variant="accent" onClick={() => open({ mode: 'create', type: s.to, prefill: s.map(record, all, clock.today()) })}>
                    {s.label} <ArrowRight aria-hidden className="size-4" />
                  </Button>
                )}
              </div>
              {s.made.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  Sudah dibuat:
                  {s.made.map((m) => (
                    <Link key={m.id} to={recordPath(target, m.id)} className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 font-mono text-fg hover:underline">
                      {m.id} <StateBadge type={target} status={m.status} />
                    </Link>
                  ))}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
