import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { canCreate } from '@/domain/records'
import { useAllRecords, useRecordList } from '../../hooks/useRecords'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { RecordInsight } from '../../records/RecordInsight'
import { RecordTable } from '../../records/RecordTable'
import { recordPath } from '../../records/text'
import { NotFound } from '../NotFound'
import { useModule } from '../modules/context'
import { useRecordType } from './useRecordType'

export default function RecordListPage() {
  const { type } = useRecordType()
  const { access } = useModule()
  const rows = useRecordList(type?.key ?? '')
  const all = useAllRecords()
  if (!type) return <NotFound />
  if (!rows.data) return <CardSkeleton lines={8} />

  return (
    <div className="space-y-4">
      <RecordInsight type={type} rows={rows.data} all={all.data} />
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-lg font-semibold">{type.name}</h2>
          {canCreate(type, access) && (
            <Link to={`${recordPath(type)}/new`} className={buttonStyles({ variant: 'accent', size: 'sm' })}>
              <Plus aria-hidden className="size-4" /> New {type.singular.toLowerCase()}
            </Link>
          )}
        </div>
        <RecordTable type={type} rows={rows.data} all={all.data} />
      </Card>
    </div>
  )
}
