import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCheck } from 'lucide-react'
import { stateOf } from '@/domain/records'
import { useAllRecords, useApprovals } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { FilterChips } from '../../ui/FilterChips'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, recordTitle } from '../../records/text'

/** The approver's inbox: every record whose next step needs this role's approval, with the step one click away. */
export default function ApprovalsPage() {
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const all = useAllRecords()
  const items = useApprovals()
  const [module, setModule] = useState<string>()
  const [busy, setBusy] = useState<string | null>(null)

  if (!all.data) return <CardSkeleton lines={8} />
  const modules = [...new Set(items.map((i) => i.type.module))]
  const shown = items.filter((i) => !module || i.type.module === module)
  const counts = Object.fromEntries(modules.map((m) => [m, items.filter((i) => i.type.module === m).length]))

  async function act(typeKey: string, id: string, to: string, label: string) {
    setBusy(`${id}-${to}`)
    try {
      await records.transition(role, typeKey, id, to)
      toast({ title: `${id}: ${label.toLowerCase()} done` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not changed', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <p className="text-sm">
          <span className="font-semibold">{items.length}</span> <span className="text-muted">waiting for {role.name}</span>
        </p>
        {modules.length > 1 && (
          <FilterChips label="Filter by module" options={modules.map((m) => ({ value: m, label: m.toUpperCase() }))} value={module} counts={counts} total={items.length} onChange={setModule} />
        )}
      </div>
      {shown.length === 0 ? (
        <div className="p-6">
          <EmptyState title="Nothing waits for your approval" action={<Link to="/modules" className="text-sm font-semibold underline">Browse modules</Link>}>
            <span className="inline-flex items-center gap-1.5">
              <CheckCheck aria-hidden className="size-4" /> Switch to an approver role, such as a manager or head, to see their queue.
            </span>
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {shown.slice(0, 60).map(({ type, record, moves }) => (
            <li key={`${type.key}-${record.id}`} data-motion="row" className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <Link to={recordPath(type, record.id)} className="min-w-0 flex-1 basis-64 hover:underline">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="rounded bg-raised px-1.5 py-0.5 font-mono font-semibold text-fg">{type.module.toUpperCase()}</span>
                  {type.singular} <span className="font-mono">{record.id}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium">{recordTitle(type, record, all.data)}</span>
              </Link>
              <StateBadge type={type} status={record.status} />
              <div className="flex gap-2">
                {moves.map((m) => (
                  <Button key={m.to} size="sm" variant={stateOf(type, m.to)?.tone === 'danger' ? 'soft' : 'solid'} loading={busy === `${record.id}-${m.to}`} onClick={() => act(type.key, record.id, m.to, m.label)}>
                    {m.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
