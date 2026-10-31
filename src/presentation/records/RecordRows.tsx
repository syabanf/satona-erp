import type { ErpRecord, RecordType } from '@/domain/records'
import { RecordControls } from './RecordControls'
import { StateBadge } from './StateBadge'
import { recordTitle, type AllRecords } from './text'

/** A short list of records with view, edit and delete on each row, for the records behind a map mark, a 3D bar or a board card. */
export function RecordRows({ type, rows, all, limit = 12 }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords; limit?: number }) {
  return (
    <ul className="divide-y divide-line rounded-panel border border-line">
      {rows.slice(0, limit).map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
          <span className="font-mono text-xs text-muted">{r.id}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{recordTitle(type, r, all)}</span>
          <StateBadge type={type} status={r.status} />
          <RecordControls type={type} record={r} view steps={false} />
        </li>
      ))}
      {rows.length > limit && <li className="px-3 py-2 text-xs text-muted">and {rows.length - limit} more in the table view</li>}
      {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted">No records here.</li>}
    </ul>
  )
}
