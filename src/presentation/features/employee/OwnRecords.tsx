import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { stateOf, type ErpRecord } from '@/domain/records'
import { ownRecords, type SelfItem } from '@/domain/selfService'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { RecordForm } from '../../records/RecordForm'
import { StateBadge } from '../../records/StateBadge'
import { fieldText, recordTitle, type AllRecords } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { FilterChips } from '../../ui/FilterChips'
import { EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

/** The employee's own records of one type, newest first, with status chips and, where they may file one, the form. */
export function OwnRecords({ item, all, me }: { item: SelfItem; all: AllRecords; me: ErpRecord }) {
  const type = typeOf(item.type!)!
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? undefined
  const filing = item.create && params.has('new')
  const set = (key: string, value?: string) => setParams((p) => (value ? p.set(key, value) : p.delete(key), p), { replace: true })

  const personal = type.fields.some((f) => f.key === 'employee')
  // Announcements are for everyone; an employee reads the published ones.
  const mine = useMemo(() => (personal ? ownRecords(all[type.key] ?? [], me.id) : (all[type.key] ?? []).filter((r) => r.status === 'published')).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)), [all, me.id, personal, type.key])
  const shown = status ? mine.filter((r) => r.status === status) : mine
  const counts = Object.fromEntries(type.workflow.states.map((s) => [s.id, mine.filter((r) => r.status === s.id).length]))
  const form = useMemo(() => ({ ...type, fields: type.fields.filter((f) => f.key !== 'employee') }), [type])
  const columns = form.fields.filter((f) => f.key !== type.titleField && (f.list || f.type === 'textarea'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {personal && <FilterChips label="Status" options={type.workflow.states.filter((s) => counts[s.id]).map((s) => ({ value: s.id, label: s.label }))} value={status} counts={counts} total={mine.length} onChange={(v) => set('status', v)} className="min-w-0 flex-1" />}
        {item.create && !filing && (
          <Button variant="accent" size="sm" className="ml-auto" onClick={() => set('new', '1')}>
            <Plus aria-hidden className="size-4" /> Ajukan {item.label.toLowerCase()}
          </Button>
        )}
      </div>

      {filing && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Ajukan {item.label.toLowerCase()}</h2>
          <RecordForm
            type={form}
            all={all}
            submitLabel="Kirim pengajuan"
            onCancel={() => set('new')}
            onSubmit={async (values) => {
              const saved = await records.create(role, type.key, { ...values, employee: me.id }, true)
              toast({ title: `${saved.id} dikirim`, description: `Status: ${stateOf(type, saved.status)?.label ?? saved.status}.` })
              set('new')
            }}
          />
        </Card>
      )}

      {shown.length === 0 ? (
        <EmptyState title={status ? 'Tidak ada data dengan status ini' : `Belum ada ${item.label.toLowerCase()}`} action={status ? <Button variant="card" size="sm" onClick={() => set('status')}>Hapus filter</Button> : undefined} />
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{recordTitle(type, r, all)}</p>
                  <p className="font-mono text-xs text-muted">{r.id}</p>
                </div>
                <StateBadge type={type} status={r.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                {columns.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'col-span-full' : undefined}>
                    <dt className="text-xs text-muted">{f.label}</dt>
                    <dd className={f.type === 'textarea' ? 'text-body' : 'truncate font-medium'}>{fieldText(f, r.values[f.key], all) || '-'}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
