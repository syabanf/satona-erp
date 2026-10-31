import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Box } from 'lucide-react'
import { dayOf } from '@/domain/calendar'
import { stateOf, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { monthLabel } from '@/lib/format'
import { useServices } from '../hooks/useServices'
import { buttonStyles } from '../ui/buttonStyles'
import { Skeleton } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { RecordRows } from './RecordRows'
import type { AllRecords } from './text'
import { zoneField, zonesOf } from './zones'

const RecordBars3D = lazy(() => import('../three/RecordBars3D'))
const SingleLine3D = lazy(() => import('../three/RecordLayouts3D').then((m) => ({ default: m.SingleLine3D })))
const Shopfloor3D = lazy(() => import('../three/RecordLayouts3D').then((m) => ({ default: m.Shopfloor3D })))

const TOKEN: Record<StateTone, string> = { neutral: '--color-subtle', info: '--color-info', warning: '--color-warning', success: '--color-success', danger: '--color-danger', accent: '--color-accent' }
const MONTHS = 6
const MODES = [
  { value: 'bars', label: 'Grafik batang' },
  { value: 'line', label: 'Single line' },
  { value: 'floor', label: 'Shopfloor' },
] as const
type Mode = (typeof MODES)[number]['value']
/** The dedicated 3D scenes some modules already have. */
const SCENES: Record<string, { to: string; label: string }> = {
  tfm: { to: '/tank-farm?view=3d', label: 'Tank farm 3D' },
  mes: { to: '/mes/cockpit?view=3d', label: 'Plant line 3D' },
  mrp: { to: '/mes/cockpit?view=3d', label: 'Plant line 3D' },
}

/** Three.js needs real colours, so read the theme tokens once per render. */
const color = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888888'

/**
 * Records in 3D, three ways: bars of status by month, a single line with the workflow's states as stations in
 * order, and a shopfloor with one zone per group. Picking a bar, station or zone lists its records with view, edit and delete.
 */
export function Record3D({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords }) {
  const { clock } = useServices()
  const today = clock.today()
  const [mode, setMode] = useState<Mode>('bars')
  const [picked, setPicked] = useState<string | undefined>()
  const [hover, setHover] = useState<string | undefined>()
  const day = useMemo(() => dayOf(type), [type])
  const months = useMemo(() => Array.from({ length: MONTHS }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - MONTHS + i, 1)).toISOString().slice(0, 7)), [today])
  const tone = (r: ErpRecord) => color(TOKEN[stateOf(type, r.status)?.tone ?? 'neutral'])

  const bars = useMemo(
    () => ({
      rows: type.workflow.states.map((s) => ({ id: s.id, label: s.label, color: color(TOKEN[s.tone]) })),
      columns: months.map(monthLabel),
      counts: type.workflow.states.map((s) => months.map((m) => rows.filter((r) => r.status === s.id && day(r).startsWith(m)).length)),
    }),
    [type, months, rows, day],
  )

  // Stations in workflow order, and zones by the grouping field with the smallest folded into "Lainnya".
  const groups = useMemo(() => {
    if (mode === 'line') return type.workflow.states.map((s) => ({ id: s.id, label: s.label, color: color(TOKEN[s.tone]), rows: rows.filter((r) => r.status === s.id) }))
    return zonesOf(type, rows, all).map((z) => ({ ...z, color: color('--color-line-strong') }))
  }, [mode, type, rows, all])

  const cells = groups.map((g) => ({ id: g.id, color: g.color, items: g.rows.map(tone) }))
  const scene = SCENES[type.module]
  const barText = (cell: string) => {
    const [s, c] = cell.split(':')
    const r = bars.rows.findIndex((x) => x.id === s)
    return `${bars.rows[r]?.label}, ${bars.columns[Number(c)]}: ${bars.counts[r]?.[Number(c)] ?? 0} data`
  }
  const groupText = (id: string) => {
    const g = groups.find((x) => x.id === id)
    return g ? `${g.label}: ${g.rows.length} data` : ''
  }
  const text = (id: string) => (mode === 'bars' ? barText(id) : groupText(id))
  const pickedRows =
    mode === 'bars'
      ? (() => {
          const [s, c] = picked?.split(':') ?? []
          return picked ? rows.filter((r) => r.status === s && day(r).startsWith(months[Number(c)] ?? '')) : []
        })()
      : (groups.find((g) => g.id === picked)?.rows ?? [])
  const toggle = (id: string) => setPicked((p) => (p === id ? undefined : id))
  const sceneLabel = `${type.name} in 3D, ${MODES.find((m) => m.value === mode)!.label.toLowerCase()}`

  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex items-center gap-3 overflow-x-auto">
        <Tabs
          label="Mode 3D"
          variant="underline"
          options={MODES}
          value={mode}
          onChange={(m) => {
            setMode(m)
            setPicked(undefined)
            setHover(undefined)
          }}
        />
        {scene && (
          <Link to={scene.to} className={cn(buttonStyles({ variant: 'card', size: 'sm' }), 'ml-auto shrink-0')}>
            <Box aria-hidden className="size-4" /> {scene.label}
          </Link>
        )}
      </div>

      <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
        <div className="relative">
          {mode === 'bars' && <RecordBars3D data={bars} picked={picked} hover={hover} onHover={setHover} onPick={(s, c) => toggle(`${s}:${c}`)} label={sceneLabel} />}
          {mode === 'line' && <SingleLine3D cells={cells} picked={picked} hover={hover} onHover={setHover} onPick={toggle} label={sceneLabel} />}
          {mode === 'floor' && <Shopfloor3D cells={cells} picked={picked} hover={hover} onHover={setHover} onPick={toggle} label={sceneLabel} />}
          {hover && <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-invert px-3 py-1 text-xs font-semibold text-on-invert">{text(hover)}</span>}
        </div>
      </Suspense>

      {mode === 'bars' ? (
        <>
          <p className="text-xs text-muted">Bulan dari kiri ke kanan: {bars.columns.join(' · ')}</p>
          <div className="flex flex-wrap gap-2">
            {bars.rows.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
                {r.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <ol className="flex flex-wrap gap-1.5" aria-label={mode === 'line' ? 'Urutan stasiun' : 'Zona shopfloor'}>
          {groups.map((g, i) => (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={picked === g.id}
                onClick={() => toggle(g.id)}
                className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors', picked === g.id ? 'bg-invert text-on-invert' : 'bg-raised text-body hover:bg-control')}
              >
                {mode === 'line' ? <span className="font-mono opacity-60">{i + 1}</span> : <span className="size-2.5 rounded-sm" style={{ background: g.color }} />}
                {g.label}
                <span className="tabular opacity-70">{g.rows.length}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {picked ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{text(picked)}</p>
          <RecordRows type={type} rows={pickedRows} all={all} />
        </div>
      ) : (
        <p className="text-xs text-muted">
          {mode === 'bars' && 'Klik batang untuk melihat datanya. Tinggi batang adalah jumlah data per status per bulan.'}
          {mode === 'line' && 'Stasiun berurutan dari kiri ke kanan mengikuti alur status. Setiap blok adalah satu data di stasiun itu.'}
          {mode === 'floor' && `Zona dibagi menurut ${zoneField(type)?.label.toLowerCase() ?? 'data'}. Warna blok mengikuti status. Klik zona untuk melihat datanya.`}
        </p>
      )}
    </div>
  )
}
