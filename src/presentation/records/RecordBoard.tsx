import { useState } from 'react'
import { Link } from 'react-router'
import { GripVertical, Plus } from 'lucide-react'
import { canCreate, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAccess } from '../hooks/useRecords'
import { Button } from '../ui/Button'
import { useRecordDrawer } from './drawer'
import { RecordControls } from './RecordControls'
import { useRecordActions } from './useRecordActions'
import { useToast } from '../ui/useToast'
import { fieldText, recordPath, recordTitle, type AllRecords } from './text'

const EDGE: Record<StateTone, string> = { neutral: 'bg-line-strong', info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', accent: 'bg-accent' }
const PER_COLUMN = 25

/**
 * One column per workflow state. Each card carries the moves this role may take, plus view, edit and delete, and can
 * be dragged onto another column: the board takes the workflow step between the two states, approval rules included.
 * New records start in the first column.
 */
export function RecordBoard({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const facts = type.fields.filter((f) => f.list && f.key !== type.titleField).slice(0, 2)
  const actions = useRecordActions()
  const toast = useToast()
  const [dragging, setDragging] = useState<ErpRecord | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // A column accepts the dragged card when the workflow has a step from the card's state straight to it.
  const reachable = (to: string) => Boolean(dragging && dragging.status !== to && type.workflow.transitions.some((t) => t.from === dragging.status && t.to === to))
  /**
   * Touch screens have no HTML drag: the grip on a card follows the finger instead, and the column under the finger
   * when it lifts takes the card.
   */
  const touchDrag = (record: ErpRecord) => (e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(record)
    const columnAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-state]') as HTMLElement | null)?.dataset.state ?? null
    const move = (ev: PointerEvent) => setOver(columnAt(ev.clientX, ev.clientY))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const to = columnAt(ev.clientX, ev.clientY)
      if (to) void dropCard(record, to)
      else {
        setDragging(null)
        setOver(null)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const drop = (to: string) => (dragging ? dropCard(dragging, to) : undefined)
  const dropCard = async (card: ErpRecord, to: string) => {
    setDragging(null)
    setOver(null)
    if (card.status === to) return
    if (!type.workflow.transitions.some((t) => t.from === card.status && t.to === to)) return toast({ tone: 'danger', title: 'Tidak bisa dipindah langsung', description: `Tidak ada langkah dari ${type.workflow.states.find((x) => x.id === card.status)?.label} ke ${type.workflow.states.find((x) => x.id === to)?.label}.` })
    await actions.step(type, card, to)
  }
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-3" style={{ minWidth: `${type.workflow.states.length * 272}px` }}>
        {type.workflow.states.map((s, i) => {
          const items = rows.filter((r) => r.status === s.id)
          return (
            <section
              key={s.id}
              aria-label={`${s.label}, ${items.length}`}
              data-state={s.id}
              onDragOver={(e) => {
                if (!reachable(s.id)) return
                e.preventDefault()
                setOver(s.id)
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                void drop(s.id)
              }}
              className={cn('flex w-[260px] shrink-0 flex-col rounded-panel bg-raised transition-shadow', dragging && reachable(s.id) && 'outline-2 outline-dashed outline-line-strong', over === s.id && 'outline-accent')}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn('size-2 rounded-full', EDGE[s.tone])} />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{s.label}</h3>
                <span className="text-xs text-muted tabular">{items.length}</span>
                {i === 0 && canCreate(type, accessFor(type.module)) && (
                  <Button size="icon-sm" variant="ghost" aria-label={`${type.singular} baru`} onClick={() => open({ mode: 'create', type: type.key })}>
                    <Plus aria-hidden className="size-4" />
                  </Button>
                )}
              </header>
              <ul className="max-h-[560px] space-y-2 overflow-y-auto px-2 pb-2">
                {items.slice(0, PER_COLUMN).map((r) => (
                  <li
                    key={r.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDragging(r)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    className={cn('animate-rise cursor-grab rounded-xl border border-line bg-card p-3 shadow-card active:cursor-grabbing', dragging?.id === r.id && 'opacity-50')}
                  >
                    <button type="button" aria-label={`Seret ${r.id}`} onPointerDown={touchDrag(r)} className="float-right -mt-1 -mr-1 grid size-8 touch-none place-items-center rounded-lg text-subtle hover:bg-raised [@media(pointer:fine)]:hidden">
                      <GripVertical aria-hidden className="size-4" />
                    </button>
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
