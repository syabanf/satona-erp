import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { byDay, dateFieldOf, dayOf, monthGrid, shiftMonth } from '@/domain/calendar'
import { canCreate, stateOf, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAccess } from '../hooks/useRecords'
import { useServices } from '../hooks/useServices'
import { Button } from '../ui/Button'
import { useRecordDrawer } from './drawer'
import { dayQuery, recordPath, recordTitle, type AllRecords } from './text'

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const CHIP: Record<StateTone, string> = {
  neutral: 'bg-raised text-body',
  info: 'bg-info-soft text-info-text',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent-text',
}
const SHOWN = 3

/**
 * A month of records on their date field, or on the day they were created when the type has no date.
 * Chips open the drawer; "+n" opens the list for that day; the + on a day creates a record dated that day. Phones get day counts.
 */
export function RecordCalendar({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const { clock } = useServices()
  const open = useRecordDrawer()
  const today = clock.today()
  const accessFor = useAccess()
  const field = dateFieldOf(type)
  const days = useMemo(() => byDay(rows, dayOf(type)), [rows, type])
  const [month, setMonth] = useState(today.slice(0, 7))
  const creatable = Boolean(field) && canCreate(type, accessFor(type.module))
  const inMonth = [...days.entries()].filter(([d]) => d.startsWith(month)).reduce((n, [, rs]) => n + rs.length, 0)
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="soft" aria-label="Bulan sebelumnya" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Button size="icon-sm" variant="soft" aria-label="Bulan berikutnya" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <h3 className="text-base font-semibold capitalize" aria-live="polite">
          {label}
        </h3>
        <span className="text-xs text-muted tabular">
          {inMonth} {type.name.toLowerCase()} · {field ? field.label.toLowerCase() : 'tanggal dibuat'}
        </span>
        {month !== today.slice(0, 7) && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setMonth(today.slice(0, 7))}>
            Bulan ini
          </Button>
        )}
      </div>
      <div role="grid" aria-label={`${type.name} by ${field ? field.label.toLowerCase() : 'created date'}, ${label}`} className="overflow-hidden rounded-panel border border-line">
        <div role="row" className="grid grid-cols-7 border-b border-line bg-raised text-center text-[11px] font-medium text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} role="columnheader" className="py-1.5">
              {d}
            </span>
          ))}
        </div>
        {monthGrid(month).map((week, w) => (
          <div key={w} role="row" className="grid grid-cols-7 divide-x divide-line border-b border-line last:border-b-0">
            {week.map((day, i) => {
              const items = day ? (days.get(day) ?? []) : []
              return (
                <div key={day ?? `e${w}-${i}`} role="gridcell" aria-label={day ? `${day}, ${items.length} records` : undefined} className={cn('min-h-16 p-1 sm:min-h-28 sm:p-1.5', !day && 'bg-raised/60')}>
                  {day && (
                    <>
                      <span className="flex items-center justify-between">
                        <span className={cn('grid size-6 place-items-center rounded-full text-[11px] tabular', day === today ? 'bg-accent font-semibold text-white' : 'text-muted')}>{Number(day.slice(8))}</span>
                        {creatable && field && (
                          <button
                            type="button"
                            aria-label={`New ${type.singular.toLowerCase()} on ${day}`}
                            onClick={() => open({ mode: 'create', type: type.key, prefill: { [field.key]: day } })}
                            className="hidden size-6 cursor-pointer place-items-center rounded-full text-subtle hover:bg-accent-soft hover:text-accent-text sm:grid"
                          >
                            <Plus aria-hidden className="size-3.5" />
                          </button>
                        )}
                      </span>
                      {items.length > 0 && (
                        <Link to={`${recordPath(type)}${dayQuery(day)}`} className="mt-1 block rounded-md bg-invert px-1 text-center text-[10px] font-semibold text-on-invert tabular sm:hidden">
                          {items.length}
                        </Link>
                      )}
                      <ul className="mt-1 hidden space-y-1 sm:block">
                        {items.slice(0, SHOWN).map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => open({ mode: 'view', type: type.key, id: r.id })}
                              title={`${r.id} · ${recordTitle(type, r, all)} · ${stateOf(type, r.status)?.label ?? r.status}`}
                              className={cn('block w-full cursor-pointer truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium hover:opacity-80', CHIP[stateOf(type, r.status)?.tone ?? 'neutral'])}
                            >
                              {recordTitle(type, r, all)}
                            </button>
                          </li>
                        ))}
                        {items.length > SHOWN && (
                          <li>
                            <Link to={`${recordPath(type)}${dayQuery(day)}`} className="block px-1.5 text-[11px] font-medium text-accent-text hover:underline">
                              +{items.length - SHOWN} lainnya
                            </Link>
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
