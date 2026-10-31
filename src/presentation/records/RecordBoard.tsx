import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { canCreate, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAccess } from '../hooks/useRecords'
import { Button } from '../ui/Button'
import { useRecordDrawer } from './drawer'
import { RecordControls } from './RecordControls'
import { fieldText, recordPath, recordTitle, type AllRecords } from './text'

const EDGE: Record<StateTone, string> = { neutral: 'bg-line-strong', info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', accent: 'bg-accent' }
const PER_COLUMN = 25

/**
 * One column per workflow state. Each card carries the moves this role may take, plus view, edit and delete,
 * so records move across the board in place. New records start in the first column.
 */
export function RecordBoard({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const facts = type.fields.filter((f) => f.list && f.key !== type.titleField).slice(0, 2)
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-3" style={{ minWidth: `${type.workflow.states.length * 272}px` }}>
        {type.workflow.states.map((s, i) => {
          const items = rows.filter((r) => r.status === s.id)
          return (
            <section key={s.id} aria-label={`${s.label}, ${items.length}`} className="flex w-[260px] shrink-0 flex-col rounded-panel bg-raised">
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn('size-2 rounded-full', EDGE[s.tone])} />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{s.label}</h3>
                <span className="text-xs text-muted tabular">{items.length}</span>
                {i === 0 && canCreate(type, accessFor(type.module)) && (
                  <Button size="icon-sm" variant="ghost" aria-label={`New ${type.singular.toLowerCase()}`} onClick={() => open({ mode: 'create', type: type.key })}>
                    <Plus aria-hidden className="size-4" />
                  </Button>
                )}
              </header>
              <ul className="max-h-[560px] space-y-2 overflow-y-auto px-2 pb-2">
                {items.slice(0, PER_COLUMN).map((r) => (
                  <li key={r.id} className="animate-rise rounded-xl border border-line bg-card p-3 shadow-card">
                    <button type="button" onClick={() => open({ mode: 'view', type: type.key, id: r.id })} className="block w-full cursor-pointer text-left">
                      <span className="font-mono text-[11px] text-muted">{r.id}</span>
                      <span className="mt-0.5 block text-sm font-medium text-fg">{recordTitle(type, r, all)}</span>
                      {facts.map((f) => (
                        <span key={f.key} className="block truncate text-xs text-muted">
                          {f.label}: {fieldText(f, r.values[f.key], all)}
                        </span>
                      ))}
                    </button>
                    <RecordControls type={type} record={r} className="mt-2" />
                  </li>
                ))}
                {items.length > PER_COLUMN && (
                  <li>
                    <Link to={`${recordPath(type)}?status=${s.id}`} className="block px-1 py-1 text-xs font-medium text-accent-text hover:underline">
                      +{items.length - PER_COLUMN} lainnya di tabel
                    </Link>
                  </li>
                )}
                {items.length === 0 && <li className="px-1 py-3 text-xs text-subtle">Kosong</li>}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
