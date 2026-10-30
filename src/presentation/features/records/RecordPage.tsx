import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, ChevronRight, Clock3, Pencil, Trash2 } from 'lucide-react'
import { RECORD_TYPES, typeOf } from '@/domain/catalog'
import { isRejection } from '@/domain/approval'
import { can } from '@/domain/erp'
import { ancestors, childTypes, referencedBy, stateOf } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Headline } from '../../ui/Headline'
import { PageBar } from '../../ui/PageBar'
import { CardSkeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { RecordChildren } from '../../records/RecordChildren'
import { StateBadge } from '../../records/StateBadge'
import { useRecordActions } from '../../records/useRecordActions'
import { fieldText, recordPath, recordTitle } from '../../records/text'
import { NotFound } from '../NotFound'
import { useModule } from '../modules/context'
import { useRecordType } from './useRecordType'

export default function RecordPage() {
  const { type, rid } = useRecordType()
  const { access } = useModule()
  const { records } = useServices()
  const actions = useRecordActions()
  const { role } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const all = useAllRecords()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (!type) return <NotFound />
  if (!all.data) return <CardSkeleton lines={8} />
  const record = all.data[type.key]?.find((r) => r.id === rid)
  if (!record) return <NotFound />

  const { approval, blocker, moves } = actions.controls(type, record)
  const waiting = type.workflow.transitions.filter((t) => t.from === record.status && !moves.some((m) => m.to === t.to))
  const signed = record.approvals ?? []
  const children = new Set(childTypes(type.key, RECORD_TYPES).map((c) => c.type.key))
  const users = referencedBy(record.id, RECORD_TYPES, all.data).filter((u) => !children.has(u.type.key))
  const lineage = ancestors(type, record, RECORD_TYPES, all.data)
  const states = type.workflow.states
  const currentIndex = states.findIndex((s) => s.id === record.status)

  async function move(to: string) {
    setBusy(to)
    try {
      const saved = await records.transition(role, type!.key, record!.id, to)
      toast({ title: `${saved.id} moved to ${stateOf(type!, to)?.label ?? to}` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not changed', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    try {
      await records.remove(role, type!.key, record!.id)
      toast({ title: `${record!.id} deleted` })
      navigate(recordPath(type!), { replace: true })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not deleted', description: e instanceof Error ? e.message : String(e) })
      setBusy(null)
      setConfirming(false)
    }
  }

  return (
    <div>
      <PageBar
        fallback={recordPath(type)}
        label={type.name}
        actions={
          <>
            {can(access, 'edit') && (
              <Link to={`${recordPath(type, record.id)}/edit`} className={buttonStyles({ variant: 'card' })}>
                <Pencil aria-hidden className="size-4" /> Edit
              </Link>
            )}
            {can(access, 'delete') && (
              <Button variant="card" onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden className="size-4" /> Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            {lineage.length > 0 && (
              <nav aria-label="Parent records" className="mb-3 flex flex-wrap items-center gap-1 text-xs">
                {lineage.map((a) => (
                  <span key={a.record.id} className="inline-flex items-center gap-1">
                    <Link to={recordPath(a.type, a.record.id)} className="rounded-full bg-raised px-2.5 py-1 hover:bg-control">
                      <span className="text-muted">{a.type.singular}</span> <span className="font-medium">{recordTitle(a.type, a.record, all.data)}</span>
                    </Link>
                    <ChevronRight aria-hidden className="size-3.5 text-subtle" />
                  </span>
                ))}
                <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-text">{type.singular}</span>
              </nav>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted">{record.id}</span>
              <StateBadge type={type} status={record.status} />
            </div>
            <Headline className="mt-2">{recordTitle(type, record, all.data)}</Headline>

            <ol aria-label="Workflow" className="mt-5 flex flex-wrap items-center gap-1.5">
              {states.map((s, i) => {
                const current = s.id === record.status
                const done = i < currentIndex
                return (
                  <li
                    key={s.id}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
                      current ? 'bg-invert text-on-invert' : done ? 'bg-control text-fg' : 'bg-raised text-subtle',
                    )}
                  >
                    {done && <Check aria-hidden className="size-3.5" />}
                    {s.label}
                  </li>
                )
              })}
            </ol>
            {(moves.length > 0 || waiting.length > 0 || blocker) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-panel bg-raised p-3">
                {moves.map((m) => (
                  <Button key={m.to} size="sm" variant={m.needs === 'approve' ? 'accent' : 'solid'} loading={busy === m.to} onClick={() => move(m.to)}>
                    {m.label}
                    {approval.step && m.needs === 'approve' && !isRejection(type, m.to) && ` · level ${approval.step.level} of ${approval.chain.length}`}
                  </Button>
                ))}
                {blocker && <p className="w-full text-xs font-semibold text-accent-text">{blocker}</p>}
                {waiting.length > 0 && !blocker && (
                  <p className="text-xs text-muted">
                    {approval.step && waiting.some((w) => w.needs === 'approve')
                      ? `Level ${approval.step.level} of ${approval.chain.length} waits for ${approval.step.role}.`
                      : `${waiting.map((w) => w.label).join(' or ')} needs ${waiting.some((w) => w.needs === 'approve') ? 'an approver' : 'edit access'} for this module.`}
                  </p>
                )}
              </div>
            )}
          </Card>

          {(approval.chain.length > 0 || signed.length > 0) && (
            <Card>
              <CardHeader title="Approval chain" action={<span className="text-xs text-muted">from the approval matrix (SYS)</span>} />
              <ol className="grid gap-2 sm:grid-cols-3">
                {(approval.chain.length ? approval.chain : signed.map((x) => ({ level: x.level, role: x.role, sla: 0 }))).map((step) => {
                  const sign = signed.find((x) => x.level === step.level)
                  const current = approval.step?.level === step.level
                  return (
                    <li key={step.level} aria-current={current ? 'step' : undefined} className={cn('rounded-panel p-3', current ? 'bg-invert text-on-invert' : 'bg-raised')}>
                      <p className={cn('flex items-center gap-1.5 text-xs', current ? 'opacity-70' : 'text-muted')}>
                        {sign ? <Check aria-hidden className="size-3.5 text-success" /> : <Clock3 aria-hidden className="size-3.5" />} Level {step.level}
                        {step.sla > 0 && ` · SLA ${step.sla} h`}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{step.role}</p>
                      <p className={cn('mt-0.5 text-xs', current ? 'opacity-70' : 'text-muted')}>
                        {sign ? `Signed by ${sign.by}, ${new Date(sign.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : current ? 'Waiting for a decision' : 'Not reached yet'}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}

          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-3 sm:grid-cols-2">
              {type.fields.map((f) => {
                const v = record.values[f.key]
                const target = f.type === 'ref' && f.ref && v ? typeOf(f.ref) : undefined
                return (
                  <div key={f.key} className={cn('rounded-panel bg-raised p-3', f.type === 'textarea' && 'sm:col-span-2')}>
                    <dt className="text-xs text-muted">{f.label}</dt>
                    <dd className="mt-0.5 text-sm font-medium break-words">
                      {target ? (
                        <Link to={recordPath(target, String(v))} className="text-accent-text hover:underline">
                          {fieldText(f, v, all.data)} <span className="font-mono text-xs text-muted">{String(v)}</span>
                        </Link>
                      ) : (
                        fieldText(f, v, all.data)
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </Card>
          <RecordChildren type={type} record={record} all={all.data} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3">
              {[...record.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} data-motion="row" className="flex gap-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-line-strong')} />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{h.action}</span>
                    <span className="block text-xs text-muted">
                      {h.by} · {new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardHeader title="Also referenced by" />
            {users.length === 0 ? (
              <p className="text-sm text-muted">No other record points here yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {users.slice(0, 12).map(({ type: t, record: r }) => (
                  <li key={`${t.key}-${r.id}`} data-motion="row">
                    <Link to={recordPath(t, r.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                      <span className="font-mono text-xs">{r.id}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{t.singular}</span>
                      <StateBadge type={t} status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog open={confirming} title={`Delete ${record.id}?`} confirm="Delete" busy={busy === 'delete'} onConfirm={remove} onClose={() => setConfirming(false)}>
        {users.length > 0 ? `${users.length} other records point at it and will show its id only.` : 'This removes it from the demo until you reset the data.'}
      </ConfirmDialog>
    </div>
  )
}
