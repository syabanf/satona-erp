import { useState } from 'react'
import { stateOf, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useRecordDrawer } from './drawer'
import { RecordRows } from './RecordRows'
import { recordTitle, type AllRecords } from './text'
import { zoneField, zonesOf } from './zones'

const TILE: Record<StateTone, string> = { neutral: 'bg-line-strong', info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', accent: 'bg-accent' }
const MAX_TILES = 40

export interface Room {
  id: string
  label: string
  /** Each record in the room with its own type, so one plan can hold several kinds of records. */
  items: ReadonlyArray<{ type: RecordType; record: ErpRecord }>
}

/**
 * A 2D floor plan: one room per zone inside the building outline, each record a square coloured by status.
 * A square opens its record in the drawer; a room's name lists its records below the plan with view, edit and delete.
 */
export function Floorplan({ rooms, all, label }: { rooms: readonly Room[]; all: AllRecords; label: string }) {
  const open = useRecordDrawer()
  const [picked, setPicked] = useState<string | null>(null)
  const room = rooms.find((r) => r.id === picked)
  const roomType = room?.items[0]?.type
  return (
    <div className="space-y-3">
      <div role="group" aria-label={label} className="hatch rounded-panel border-4 border-fg/80 bg-raised p-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {rooms.map((r) => (
            <section key={r.id} className={cn('flex min-h-32 flex-col rounded-lg border-2 bg-card p-2 transition-colors', picked === r.id ? 'border-accent' : 'border-line-strong')}>
              <button type="button" onClick={() => setPicked(picked === r.id ? null : r.id)} aria-pressed={picked === r.id} className="flex cursor-pointer items-baseline gap-2 text-left">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide uppercase">{r.label}</span>
                <span className="text-xs text-muted tabular">{r.items.length}</span>
              </button>
              <div className="mt-2 flex flex-wrap content-start gap-1">
                {r.items.slice(0, MAX_TILES).map(({ type, record }) => (
                  <button
                    key={`${type.key}-${record.id}`}
                    type="button"
                    onClick={() => open({ mode: 'view', type: type.key, id: record.id })}
                    title={`${record.id} · ${recordTitle(type, record, all)} · ${stateOf(type, record.status)?.label ?? record.status}`}
                    aria-label={`${record.id}, ${stateOf(type, record.status)?.label ?? record.status}`}
                    className={cn('size-5 cursor-pointer rounded-sm transition-transform hover:scale-125', TILE[stateOf(type, record.status)?.tone ?? 'neutral'])}
                  />
                ))}
                {r.items.length > MAX_TILES && <span className="self-center text-[11px] text-muted">+{r.items.length - MAX_TILES}</span>}
                {r.items.length === 0 && <span className="text-[11px] text-subtle">Kosong</span>}
              </div>
            </section>
          ))}
        </div>
      </div>
      {room && roomType ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {room.label}: {room.items.length} data
          </p>
          <RecordRows type={roomType} rows={room.items.filter((i) => i.type === roomType).map((i) => i.record)} all={all} />
        </div>
      ) : (
        <p className="text-xs text-muted">Klik kotak untuk membuka datanya, atau nama ruang untuk melihat daftarnya. Warna kotak mengikuti status.</p>
      )}
    </div>
  )
}

/** The Denah view of a list: rooms by the type's zone field. */
export function RecordFloorplan({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const rooms = zonesOf(type, rows, all).map((z) => ({ id: z.id, label: z.label, items: z.rows.map((record) => ({ type, record })) }))
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Ruang dibagi menurut {zoneField(type)?.label.toLowerCase() ?? 'data'}.</p>
      <Floorplan rooms={rooms} all={all} label={`Denah ${type.name}`} />
    </div>
  )
}
