import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { canCreate, stateOf, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { addDays, daysBetween, spanOf, spanRule, type Span } from '@/domain/timeline'
import { cn } from '@/lib/cn'
import { useAccess } from '../hooks/useRecords'
import { useServices } from '../hooks/useServices'
import { Button } from '../ui/Button'
import { Tabs } from '../ui/Tabs'
import { useRecordDrawer } from './drawer'
import { recordTitle, type AllRecords } from './text'

const BAR: Record<StateTone, string> = { neutral: 'bg-line-strong', info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', accent: 'bg-accent' }
const ZOOMS = [
  { value: 'week', label: '2 minggu', days: 14 },
  { value: 'month', label: '2 bulan', days: 61 },
  { value: 'quarter', label: '6 bulan', days: 183 },
] as const
type Zoom = (typeof ZOOMS)[number]['value']
const PAGE = 30

/** Axis ticks: every day for two weeks, each Monday for two months, each first of the month for six. */
function ticks(from: string, days: number, zoom: Zoom) {
  return Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d, i) => {
    if (zoom === 'week') return true
    if (zoom === 'month') return new Date(`${d}T00:00:00Z`).getUTCDay() === 1
    return d.endsWith('-01') || i === 0
  })
}

const tickLabel = (d: string, zoom: Zoom) =>
  zoom === 'quarter' ? new Date(`${d}T00:00:00Z`).toLocaleString('id-ID', { month: 'short', timeZone: 'UTC' }) : `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`

/**
 * Records as bars on a time axis, one row each, coloured by status. Bars open the record in the drawer
 * (view, edit, delete, workflow moves); + creates a new one. Zoom and the arrows move the window.
 */
export function RecordGantt({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const { clock } = useServices()
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const today = clock.today()
  const [zoom, setZoom] = useState<Zoom>('month')
  const span = ZOOMS.find((z) => z.value === zoom)!.days
  const [from, setFrom] = useState(() => addDays(today, -Math.round(61 / 3)))
  const [showAll, setShowAll] = useState(false)
  const rule = spanRule(type)
  const to = addDays(from, span - 1)

  const items = useMemo(() => {
    const of = spanOf(type)
    return rows
      .map((r) => ({ r, s: of(r) }))
      .filter((x): x is { r: ErpRecord; s: Span } => Boolean(x.s && x.s.end >= from && x.s.start <= to))
      .sort((a, b) => a.s.start.localeCompare(b.s.start))
  }, [type, rows, from, to])
  const shown = showAll ? items : items.slice(0, PAGE)
  const pct = (day: string) => (Math.min(Math.max(daysBetween(from, day), 0), span) / span) * 100
  const todayAt = today >= from && today <= to ? pct(today) : undefined

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="soft" aria-label="Mundur" onClick={() => setFrom((f) => addDays(f, -Math.round(span / 2)))}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Button size="icon-sm" variant="soft" aria-label="Maju" onClick={() => setFrom((f) => addDays(f, Math.round(span / 2)))}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFrom(addDays(today, -Math.round(span / 3)))}>
          Hari ini
        </Button>
        <Tabs
          label="Rentang waktu"
          options={ZOOMS}
          value={zoom}
          onChange={(z) => {
            setZoom(z)
            setFrom(addDays(today, -Math.round(ZOOMS.find((x) => x.value === z)!.days / 3)))
          }}
        />
        <span className="text-xs text-muted tabular" aria-live="polite">
          {from} s/d {to} · {items.length} data · batang: {rule.label.toLowerCase()}
        </span>
        {canCreate(type, accessFor(type.module)) && (
          <Button size="sm" variant="accent" className="ml-auto" onClick={() => open({ mode: 'create', type: type.key })}>
            <Plus aria-hidden className="size-4" /> Baru
          </Button>
        )}
      </div>

      <div className="no-scrollbar overflow-x-auto rounded-panel border border-line">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[220px_1fr] border-b border-line bg-raised text-[11px] text-muted">
            <span className="px-3 py-2 font-medium">{type.singular}</span>
            <div className="relative h-8">
              {ticks(from, span, zoom).map((d) => (
                <span key={d} className="absolute top-0 h-full border-l border-line pl-1 leading-8 tabular" style={{ left: `${pct(d)}%` }}>
                  {tickLabel(d, zoom)}
                </span>
              ))}
            </div>
          </div>
          {shown.map(({ r, s }) => {
            const tone = stateOf(type, r.status)?.tone ?? 'neutral'
            const left = pct(s.start)
            const width = Math.max(pct(addDays(s.end, 1)) - left, 0.8)
            const milestone = s.start === s.end
            const title = recordTitle(type, r, all)
            return (
              <div key={r.id} className="grid grid-cols-[220px_1fr] border-b border-line last:border-b-0 hover:bg-raised/60">
                <button type="button" onClick={() => open({ mode: 'view', type: type.key, id: r.id })} className="min-w-0 cursor-pointer px-3 py-2 text-left text-sm hover:underline">
                  <span className="block font-mono text-[11px] text-muted">{r.id}</span>
                  <span className="block truncate font-medium">{title}</span>
                </button>
                <div className="relative">
                  {todayAt !== undefined && <span aria-hidden className="absolute inset-y-0 w-0.5 bg-accent/60" style={{ left: `${todayAt}%` }} />}
                  <button
                    type="button"
                    onClick={() => open({ mode: 'view', type: type.key, id: r.id })}
                    title={`${r.id} · ${title} · ${s.start}${milestone ? '' : ` s/d ${s.end}`} · ${stateOf(type, r.status)?.label ?? r.status}`}
                    aria-label={`${r.id}, ${s.start}${milestone ? '' : ` to ${s.end}`}`}
                    className={cn(
                      'absolute top-1/2 h-5 -translate-y-1/2 cursor-pointer transition-opacity hover:opacity-80',
                      milestone ? 'size-3.5 rotate-45 rounded-[3px]' : 'rounded-full',
                      BAR[tone],
                    )}
                    style={milestone ? { left: `calc(${left}% - 7px)` } : { left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </div>
            )
          })}
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Tidak ada data di rentang ini. Geser waktu atau perbesar rentang.</p>}
        </div>
      </div>
      {items.length > PAGE && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Tampilkan ${PAGE} pertama` : `Tampilkan semua ${items.length}`}
        </Button>
      )}
    </div>
  )
}
