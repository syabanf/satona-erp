import { useNavigate, useSearchParams } from 'react-router'
import { can } from '@/domain/erp'
import { canCreate } from '@/domain/records'
import { useAllRecords, useRecordList } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Card } from '../../ui/Card'
import { Headline } from '../../ui/Headline'
import { PageBar } from '../../ui/PageBar'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { RecordForm } from '../../records/RecordForm'
import { recordPath } from '../../records/text'
import { NotFound } from '../NotFound'
import { useModule } from '../modules/context'
import { useRecordType } from './useRecordType'

/** Create when the route has no record id, edit when it has one. */
export default function RecordFormPage() {
  const { type, rid } = useRecordType()
  const { access } = useModule()
  const { records } = useServices()
  const { role } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const rows = useRecordList(type?.key ?? '')
  const all = useAllRecords()
  if (!type) return <NotFound />
  if (!rows.data || !all.data) return <CardSkeleton lines={6} />

  const existing = rid ? rows.data.find((r) => r.id === rid) : undefined
  if (rid && !existing) return <NotFound />
  const back = existing ? recordPath(type, existing.id) : recordPath(type)
  if (!(existing ? can(access, 'edit') : canCreate(type, access))) {
    return <EmptyState title={`${role.name} cannot ${existing ? 'edit' : 'create'} ${type.name.toLowerCase()}`}>Your access to this module is read only.</EmptyState>
  }

  return (
    <div>
      <PageBar fallback={back} label={existing ? existing.id : type.name} />
      <Card className="max-w-3xl">
        <Headline className="mb-5">{existing ? `Edit ${existing.id}` : `New ${type.singular.toLowerCase()}`}</Headline>
        <RecordForm
          type={type}
          all={all.data}
          initial={existing?.values ?? Object.fromEntries(type.fields.filter((f) => params.get(f.key)).map((f) => [f.key, params.get(f.key) ?? '']))}
          submitLabel={existing ? 'Save changes' : `Create ${type.singular.toLowerCase()}`}
          onCancel={() => navigate(back)}
          onSubmit={async (values) => {
            const saved = existing ? await records.update(role, type.key, existing.id, values) : await records.create(role, type.key, values)
            toast({ title: `${type.singular} ${saved.id} ${existing ? 'saved' : 'created'}` })
            navigate(recordPath(type, saved.id), { replace: true })
          }}
        />
      </Card>
    </div>
  )
}
