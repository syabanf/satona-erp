import { useEffect } from 'react'
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
import { useRecordDrawer } from '../../records/drawer'
import { RecordForm } from '../../records/RecordForm'
import { recordPath } from '../../records/text'
import { NotFound } from '../NotFound'
import { useModule } from '../modules/context'
import { useRecordType } from './useRecordType'

/** Edits a record. Without a record id (a Create T-code or link) it opens the create modal over the list instead. */
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
  const open = useRecordDrawer()
  const creating = Boolean(type && !rid && canCreate(type, access))

  // Query parameters prefill fields, so a link can start a record from its parent.
  useEffect(() => {
    if (!type || !creating) return
    const prefill = Object.fromEntries(type.fields.filter((f) => params.get(f.key)).map((f) => [f.key, params.get(f.key) ?? '']))
    open({ mode: 'create', type: type.key, prefill })
    navigate(recordPath(type), { replace: true })
  }, [type, creating, params, open, navigate])

  if (!type) return <NotFound />
  if (creating) return <CardSkeleton lines={6} />
  if (!rows.data || !all.data) return <CardSkeleton lines={6} />

  if (!rid) return <EmptyState title={`${role.name} cannot create ${type.name.toLowerCase()}`}>Your access to this module is read only.</EmptyState>
  const existing = rows.data.find((r) => r.id === rid)
  if (!existing) return <NotFound />
  const back = recordPath(type, existing.id)
  if (!can(access, 'edit')) return <EmptyState title={`${role.name} cannot edit ${type.name.toLowerCase()}`}>Your access to this module is read only.</EmptyState>

  return (
    <div>
      <PageBar fallback={back} label={existing.id} />
      <Card className="max-w-3xl">
        <Headline className="mb-5">{`Edit ${existing.id}`}</Headline>
        <RecordForm
          type={type}
          all={all.data}
          initial={existing.values}
          submitLabel="Save changes"
          onCancel={() => navigate(back)}
          onSubmit={async (values) => {
            const saved = await records.update(role, type.key, existing.id, values)
            toast({ title: `${type.singular} ${saved.id} saved` })
            navigate(back, { replace: true })
          }}
        />
      </Card>
    </div>
  )
}
