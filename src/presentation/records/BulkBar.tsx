import { useState } from 'react'
import { Download, Trash2, X } from 'lucide-react'
import { can } from '@/domain/erp'
import type { ErpRecord, RecordType } from '@/domain/records'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useServices } from '../hooks/useServices'
import { useSession } from '../hooks/useSession'
import { useToast } from '../ui/useToast'
import { useRecordActions } from './useRecordActions'

/** Actions on the selected rows: workflow moves every selected record allows, delete, export. */
export function BulkBar({ type, rows, onExport, onClear }: { type: RecordType; rows: readonly ErpRecord[]; onExport: () => void; onClear: () => void }) {
  const actions = useRecordActions()
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const controls = rows.map((r) => actions.controls(type, r))
  // A move shows only when the role can take it on every selected record.
  const common = (controls[0]?.moves ?? []).filter((m) => controls.every((c) => c.moves.some((x) => x.to === m.to && x.label === m.label)))
  const mayDelete = controls.length > 0 && can(controls[0]!.access, 'delete')

  /** Runs one write per row and reports once: how many went through and the first reason one did not. */
  async function each(key: string, label: string, work: (r: ErpRecord) => Promise<unknown>) {
    setBusy(key)
    let ok = 0
    let reason = ''
    for (const r of rows) {
      try {
        await work(r)
        ok += 1
      } catch (e) {
        reason ||= `${r.id}: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    setBusy(null)
    toast(ok === rows.length ? { title: `${label}: ${ok} ${type.name.toLowerCase()}` } : { tone: 'danger', title: `${label}: ${ok} of ${rows.length} done`, description: reason })
    onClear()
  }

  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5">
      <span className="text-sm font-semibold text-accent-text tabular">{rows.length} selected</span>
      {common.map((m) => (
        <Button key={m.to} size="sm" variant="solid" loading={busy === m.to} onClick={() => each(m.to, m.label, (r) => records.transition(role, type.key, r.id, m.to))}>
          {m.label}
        </Button>
      ))}
      <Button size="sm" variant="card" onClick={onExport}>
        <Download aria-hidden className="size-4" /> Export
      </Button>
      {mayDelete && (
        <Button size="sm" variant="card" onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden className="size-4" /> Delete
        </Button>
      )}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X aria-hidden className="size-4" /> Clear
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${rows.length} ${rows.length === 1 ? type.singular.toLowerCase() : type.name.toLowerCase()}?`}
        confirm="Delete"
        busy={busy === 'delete'}
        onClose={() => setConfirming(false)}
        onConfirm={() => each('delete', 'Deleted', (r) => records.remove(role, type.key, r.id)).then(() => setConfirming(false))}
      >
        Their history goes too. Records that point to them keep the reference.
      </ConfirmDialog>
    </div>
  )
}
