import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Box } from 'lucide-react'
import { dayOf } from '@/domain/calendar'
import type { ErpRecord, RecordType, StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { monthLabel } from '@/lib/format'
import { useServices } from '../hooks/useServices'
import { buttonStyles } from '../ui/buttonStyles'
import { Skeleton } from '../ui/States'
import { RecordRows } from './RecordRows'
import type { AllRecords } from './text'

const RecordBars3D = lazy(() => import('../three/RecordBars3D'))
const TOKEN: Record<StateTone, string> = { neutral: '--color-subtle', info: '--color-info', warning: '--color-warning', success: '--color-success', danger: '--color-danger', accent: '--color-accent' }
const MONTHS = 6
/** The dedicated 3D scenes some modules already have. */
const SCENES: Record<string, { to: string; label: string }> = {
  tfm: { to: '/tank-farm?view=3d', label: 'Tank farm 3D' },
  mes: { to: '/mes/cockpit?view=3d', label: 'Plant line 3D' },
  mrp: { to: '/mes/cockpit?view=3d', label: 'Plant line 3D' },
}

/** Three.js needs real colours, so read the theme tokens once per render. */
const color = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888888'

/** Records as 3D bars, status by month; picking a bar lists its records with view, edit and delete. */
export function Record3D({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const { clock } = useServices()
  const today = clock.today()
  const [picked, setPicked] = useState<string | undefined>()
  const [hover, setHover] = useState<string | undefined>()
  const day = useMemo(() => dayOf(type), [type])
  const months = useMemo(() => Array.from({ length: MONTHS }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - MONTHS + i, 1)).toISOString().slice(0, 7)), [today])
  const data = useMemo(
    () => ({
      rows: type.workflow.states.map((s) => ({ id: s.id, label: s.label, color: color(TOKEN[s.tone]) })),
      columns: months.map(monthLabel),
      counts: type.workflow.states.map((s) => months.map((m) => rows.filter((r) => r.status === s.id && day(r).startsWith(m)).length)),
    }),
    [type, months, rows, day],
  )
  const [status, column] = picked?.split(':') ?? []
  const inCell = picked ? rows.filter((r) => r.status === status && day(r).startsWith(months[Number(column)] ?? '')) : []
  const scene = SCENES[type.module]
  const cellText = (cell: string) => {
    const [s, c] = cell.split(':')
    const r = data.rows.findIndex((x) => x.id === s)
    return `${data.rows[r]?.label}, ${data.columns[Number(c)]}: ${data.counts[r]?.[Number(c)] ?? 0} data`
  }

  return (
    <div className="space-y-3">
      <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
        <div className="relative">
          <RecordBars3D data={data} picked={picked} hover={hover} onHover={setHover} onPick={(s, c) => setPicked(`${s}:${c}` === picked ? undefined : `${s}:${c}`)} label={`${type.name} per status and month in 3D`} />
          {hover && <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-invert px-3 py-1 text-xs font-semibold text-on-invert">{cellText(hover)}</span>}
        </div>
      </Suspense>
      <p className="text-xs text-muted">Bulan dari kiri ke kanan: {data.columns.join(' · ')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {data.rows.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
            {r.label}
          </span>
        ))}
        {scene && (
          <Link to={scene.to} className={cn(buttonStyles({ variant: 'card', size: 'sm' }), 'ml-auto')}>
            <Box aria-hidden className="size-4" /> {scene.label}
          </Link>
        )}
      </div>
      {picked ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{cellText(picked)}</p>
          <RecordRows type={type} rows={inCell} all={all} />
        </div>
      ) : (
        <p className="text-xs text-muted">Klik batang untuk melihat datanya. Tinggi batang adalah jumlah data per status per bulan.</p>
      )}
    </div>
  )
}
