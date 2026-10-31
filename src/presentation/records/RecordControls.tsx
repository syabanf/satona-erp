import { useState } from 'react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { isRejection } from '@/domain/approval'
import { can } from '@/domain/erp'
import type { ErpRecord, RecordType } from '@/domain/records'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useRecordDrawer } from './drawer'
import { useRecordActions } from './useRecordActions'

/**
 * Everything a role can do to one record, in place: its workflow moves (approval levels included), edit and delete.
 * `view` adds a button that opens the record in the drawer; `steps={false}` keeps only view, edit and delete for tight rows.
 */
export function RecordControls({ type, record, view = false, steps = true, className }: { type: RecordType; record: ErpRecord; view?: boolean; steps?: boolean; className?: string }) {
  const actions = useRecordActions()
  const open = useRecordDrawer()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { access, approval, moves, blocker } = actions.controls(type, record)

  async function act(key: string, work: () => Promise<unknown>) {
    setBusy(key)
    await work()
    setBusy(null)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
      {steps && moves.map((m) => (
        <Button key={m.to} size="sm" variant={m.needs === 'approve' && !isRejection(type, m.to) ? 'accent' : isRejection(type, m.to) ? 'soft' : 'solid'} loading={busy === m.to} onClick={() => act(m.to, () => actions.step(type, record, m.to))}>
          {m.label}
          {approval.step && m.needs === 'approve' && !isRejection(type, m.to) && ` · L${approval.step.level}/${approval.chain.length}`}
        </Button>
      ))}
      {view && (
        <Button size="icon-sm" variant="soft" aria-label={`View ${record.id}`} onClick={() => open({ mode: 'view', type: type.key, id: record.id })}>
          <Eye aria-hidden className="size-4" />
        </Button>
      )}
      {can(access, 'edit') && (
        <Button size="icon-sm" variant="soft" aria-label={`Edit ${record.id}`} onClick={() => open({ mode: 'edit', type: type.key, id: record.id })}>
          <Pencil aria-hidden className="size-4" />
        </Button>
      )}
      {can(access, 'delete') && (
        <Button size="icon-sm" variant="soft" aria-label={`Delete ${record.id}`} onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden className="size-4" />
        </Button>
      )}
      {blocker && <span className="w-full text-xs font-semibold text-accent-text">{blocker}</span>}
      {!moves.length && approval.step && <span className="text-xs text-muted">Waits for {approval.step.role}</span>}
      <ConfirmDialog
        open={confirming}
        title={`Delete ${record.id}?`}
        confirm="Delete"
        busy={busy === 'delete'}
        onClose={() => setConfirming(false)}
        onConfirm={() => act('delete', () => actions.remove(type, record.id)).then(() => setConfirming(false))}
      >
        The {type.singular.toLowerCase()} and its history go away. Records that point to it keep the reference.
      </ConfirmDialog>
    </div>
  )
}
