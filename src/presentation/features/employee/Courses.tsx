import { Link } from 'react-router'
import { typeOf } from '@/domain/catalog'
import type { ErpRecord } from '@/domain/records'
import { ownRecords } from '@/domain/selfService'
import { StateBadge } from '../../records/StateBadge'
import type { AllRecords } from '../../records/text'
import { buttonStyles } from '../../ui/buttonStyles'
import { EmptyState } from '../../ui/States'

const TYPE = typeOf('hrs.enrollments')!

/** The courses assigned to the employee, unfinished first, each with its progress and the button that opens it. */
export function Courses({ all, me }: { all: AllRecords; me: ErpRecord }) {
  const mine = ownRecords(all[TYPE.key] ?? [], me.id).toSorted((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  if (!mine.length) return <EmptyState title="Belum ada kursus yang ditugaskan" />
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {mine.map((e) => {
        const course = all['hrs.courses']?.find((c) => c.id === e.values.course)
        const progress = Number(e.values.progress) || 0
        return (
          <li key={e.id} className="flex flex-col rounded-card border border-line bg-card p-4 shadow-card">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 font-semibold">{String(course?.values.title ?? e.values.course)}</p>
              <StateBadge type={TYPE} status={e.status} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {String(course?.values.category ?? '')} · {String(course?.values.hours ?? '-')} jam{course?.values.mandatory === 'Yes' ? ' · wajib' : ''}
              {e.values.validUntil ? ` · sertifikat sampai ${String(e.values.validUntil)}` : ''}
            </p>
            <span className="mt-3 block h-1.5 rounded-full bg-control">
              <span className="block h-full rounded-full bg-invert" style={{ width: `${progress}%` }} />
            </span>
            <span className="mt-1 text-xs text-muted tabular">{progress}%</span>
            <Link to={`/me/courses/${e.id}`} className={buttonStyles({ variant: e.status === 'completed' ? 'card' : 'accent', size: 'sm', className: 'mt-3 self-start' })}>
              {e.status === 'completed' ? 'Lihat' : e.status === 'assigned' ? 'Mulai' : 'Lanjutkan'}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
