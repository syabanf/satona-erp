import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BellOff, ChevronRight, ClipboardPlus, Timer, Wrench } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { conditionOf, type Condition } from '@/domain/maintenance'
import type { ErpRecord } from '@/domain/records'
import { PROCESS_TAGS, processReading, stationState, type StationState } from '@/domain/telemetry'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useTicker } from '../../hooks/useTicker'
import { useRecordDrawer } from '../../records/drawer'
import { recordPath } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton, Skeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { KpiTile } from './KpiTile'

const PlantLine3D = lazy(() => import('../../three/PlantLine3D'))

const LINES = ['Line A Gresik', 'Line B Gresik'] as const
const FLOW = ['Mixer', 'Granulator', 'Dryer', 'Cooler', 'Screen', 'Bagging']
const VIEWS = [
  { value: 'mimic', label: 'Mimik proses' },
  { value: '3d', label: '3D' },
] as const
const LAMP: Record<StationState, string> = { running: 'bg-success', alarm: 'bg-accent animate-pulse', stopped: 'bg-subtle' }
const STATE_TEXT: Record<StationState, string> = { running: 'Berjalan', alarm: 'Alarm', stopped: 'Berhenti' }
const v = (r: ErpRecord | undefined, k: string) => String(r?.values[k] ?? '')

/**
 * Plant SCADA for the two Gresik granulation lines: each work centre as a station in flow order with live process tags,
 * the alarm list, and a station panel that opens a maintenance request, a work order or a downtime event in place.
 * A machine that is down or in maintenance stops its station; a machine whose condition readings warn drifts past its limits.
 */
export default function PlantScada() {
  const all = useAllRecords()
  const { clock } = useServices()
  const elapsed = useTicker(4)
  const open = useRecordDrawer()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === '3d' ? '3d' : 'mimic'
  const line = LINES.find((l) => l === params.get('line')) ?? LINES[0]
  const [picked, setPicked] = useState<string>()
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set())
  const set = (k: string, value: string) => setParams((p) => (p.set(k, value), p), { replace: true })

  // The parts that do not move: each station with its machine and the machine's worst condition.
  const plant = useMemo(() => {
    if (!all.data) return null
    const assets = (all.data['eam.assets'] ?? []).filter((a) => !a.values.parent)
    const worst = new Map<string, Condition>()
    const latest = new Map<string, ErpRecord>()
    for (const r of all.data['eam.conditions'] ?? []) {
      const key = `${v(r, 'asset')}|${v(r, 'parameter')}`
      if (v(r, 'date') >= v(latest.get(key), 'date')) latest.set(key, r)
    }
    const rank = { Normal: 0, Warning: 1, Alarm: 2 }
    for (const r of latest.values()) {
      const c = conditionOf(Number(r.values.value), Number(r.values.limit))
      if (rank[c] > rank[worst.get(v(r, 'asset')) ?? 'Normal']) worst.set(v(r, 'asset'), c)
    }
    return (all.data['mrp.workcenters'] ?? [])
      .filter((wc) => LINES.includes(v(wc, 'line') as (typeof LINES)[number]))
      .sort((a, b) => FLOW.indexOf(v(a, 'kind')) - FLOW.indexOf(v(b, 'kind')))
      .map((wc) => {
        const twins = assets.filter((a) => a.values.kind === wc.values.kind)
        const asset = twins[LINES.indexOf(v(wc, 'line') as (typeof LINES)[number]) % Math.max(1, twins.length)]
        return { wc, asset, condition: (asset && worst.get(asset.id)) ?? ('Normal' as Condition), conditions: asset ? [...latest.values()].filter((r) => r.values.asset === asset.id) : [] }
      })
  }, [all.data])

  if (!plant || !all.data) return <CardSkeleton lines={8} />

  const stations = plant.map((p) => {
    const stopped = p.asset && ['down', 'maintenance'].includes(p.asset.status)
    const mode = stopped ? 'stopped' : p.condition === 'Normal' ? 'normal' : 'drift'
    const tags = (PROCESS_TAGS[v(p.wc, 'kind')] ?? []).map((tag) => ({ tag, ...processReading(p.wc.id, tag, elapsed, mode) }))
    return { ...p, tags, state: stationState(p.asset?.status, p.condition === 'Alarm', tags.some((t) => t.alarm)) }
  })
  const onLine = stations.filter((s) => v(s.wc, 'line') === line)
  const alarms = stations.flatMap((s) => s.tags.filter((t) => t.alarm).map((t) => ({ id: `${s.wc.id}:${t.tag.key}`, station: s, ...t })))
  const unacked = alarms.filter((a) => !acked.has(a.id))
  const station = stations.find((s) => s.wc.id === picked) ?? unacked[0]?.station ?? onLine[0]
  const lineRunning = onLine.every((s) => s.state !== 'stopped')
  const feed = stations.filter((s) => v(s.wc, 'kind') === 'Mixer').reduce((sum, s) => sum + (s.tags[0]?.value ?? 0), 0)
  const today = clock.today()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Stasiun berjalan" value={stations.filter((s) => s.state !== 'stopped').length} format={(n) => `${Math.round(n)} / ${stations.length}`} to={recordPath(typeOf('mrp.workcenters')!)} accent note="dua lini Gresik" />
        <KpiTile label="Alarm belum diakui" value={unacked.length} format={(n) => String(Math.round(n))} to={recordPath(typeOf('eam.conditions')!)} note={`${alarms.length} alarm aktif`} />
        <KpiTile label="Laju umpan" value={feed} format={(n) => `${n.toFixed(1)} t/h`} to={recordPath(typeOf('mes.oee')!)} note="jumlah mixer kedua lini" live />
        <KpiTile label="Stasiun berhenti" value={stations.filter((s) => s.state === 'stopped').length} format={(n) => String(Math.round(n))} to={`${recordPath(typeOf('eam.assets')!)}?status=down`} note="mesin rusak atau dirawat" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Proses granulasi</h2>
          <Tabs label="Lini" variant="underline" options={LINES.map((l) => ({ value: l, label: l }))} value={line} onChange={(l) => set('line', l)} />
          <Tabs label="Tampilan" options={VIEWS} value={view} onChange={(x) => set('view', x)} className="ml-auto" />
        </div>
        {view === '3d' ? (
          <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
            <PlantLine3D
              label={`${line} in 3D`}
              stations={onLine.map((s) => ({ id: s.wc.id, name: v(s.wc, 'name'), oee: s.state === 'stopped' ? 10 : 70 + (s.tags[0] ? (s.tags[0].value / s.tags[0].tag.limit) * 25 : 0), state: s.state, caption: STATE_TEXT[s.state] }))}
              onSelect={setPicked}
            />
          </Suspense>
        ) : (
          <>
            <div aria-hidden className={cn('scada-flow mb-3 h-1.5 rounded-full', !lineRunning && 'opacity-30 [animation-play-state:paused]')} />
            <ul aria-label={`Stasiun ${line}`} className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {onLine.map((s, i) => (
                <li key={s.wc.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={station?.wc.id === s.wc.id}
                    onClick={() => setPicked(s.wc.id)}
                    className={cn(
                      'flex h-full w-full cursor-pointer flex-col gap-2 rounded-panel border-2 bg-raised p-3 text-left transition-colors',
                      s.state === 'alarm' ? 'border-accent' : station?.wc.id === s.wc.id ? 'border-fg' : 'border-transparent hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', LAMP[s.state])} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{v(s.wc, 'name')}</span>
                    </span>
                    <span className="truncate text-xs text-muted">
                      {STATE_TEXT[s.state]}
                      {s.asset ? ` · ${v(s.asset, 'name')}` : ''}
                    </span>
                    {s.tags.map((t) => (
                      <span key={t.tag.key} className="block">
                        <span className="flex justify-between gap-2 text-[11px] text-muted">
                          <span className="truncate">{t.tag.label}</span>
                          <span className={cn('shrink-0 tabular', t.alarm ? 'font-semibold text-accent-text' : 'text-fg')}>
                            {t.value} {t.tag.unit}
                          </span>
                        </span>
                        <Meter value={Math.min(1, t.value / t.tag.limit)} tone={t.alarm ? 'accent' : 'info'} className="mt-1" label={`${t.tag.label} terhadap batas`} />
                      </span>
                    ))}
                  </button>
                  {i < onLine.length - 1 && <ChevronRight aria-hidden className="absolute top-1/2 -right-3.5 z-10 hidden size-4 -translate-y-1/2 text-muted xl:block" />}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Alarm"
            action={
              unacked.length > 0 && (
                <Button variant="card" size="sm" onClick={() => setAcked(new Set(alarms.map((a) => a.id)))}>
                  <BellOff aria-hidden className="size-4" /> Akui semua
                </Button>
              )
            }
          />
          {alarms.length === 0 ? (
            <p className="text-sm text-muted">Semua tag di bawah batasnya.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alarms.map((a) => (
                <li key={a.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm', acked.has(a.id) && 'opacity-55')}>
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', acked.has(a.id) ? 'bg-subtle' : 'bg-accent animate-pulse')} />
                  <button type="button" onClick={() => (set('line', v(a.station.wc, 'line')), setPicked(a.station.wc.id))} className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline">
                    <span className="font-medium">{v(a.station.wc, 'name')}</span> · {a.tag.label}
                  </button>
                  <span className="text-xs font-semibold text-accent-text tabular">
                    {a.value} / {a.tag.limit} {a.tag.unit}
                  </span>
                  {!acked.has(a.id) && (
                    <Button variant="ghost" size="sm" onClick={() => setAcked((s) => new Set(s).add(a.id))}>
                      Akui
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {station && (
          <Card className="lg:col-span-2">
            <CardHeader title={v(station.wc, 'name')} action={<span className="text-xs text-muted">{STATE_TEXT[station.state]}</span>} />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Mesin</dt>
                <dd className="min-w-0 truncate">{station.asset ? <Link to={recordPath(typeOf('eam.assets')!, station.asset.id)} className="text-accent-text hover:underline">{v(station.asset, 'name')}</Link> : 'Tidak terdaftar sebagai aset'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Kondisi</dt>
                <dd className={cn(station.condition !== 'Normal' && 'font-semibold text-accent-text')}>{station.condition}</dd>
              </div>
              {station.conditions.map((c) => (
                <div key={c.id} className="flex justify-between gap-3 text-xs">
                  <dt className="truncate text-muted">{v(c, 'parameter')}</dt>
                  <dd className="tabular">
                    {v(c, 'value')} / {v(c, 'limit')}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {station.asset && (
                <Button variant="accent" size="sm" onClick={() => open({ mode: 'create', type: 'eam.requests', prefill: { asset: station.asset!.id, title: `${station.tags.find((t) => t.alarm)?.tag.label ?? 'Kondisi'} di atas batas, ${v(station.wc, 'name')}`, severity: station.state === 'alarm' ? 'High' : 'Medium', impact: station.state === 'stopped' ? 'Stopped' : 'Reduced', source: 'Operator', reported: today } })}>
                  <ClipboardPlus aria-hidden className="size-4" /> Permintaan perawatan
                </Button>
              )}
              {station.asset && (
                <Button variant="card" size="sm" onClick={() => open({ mode: 'create', type: 'eam.workorders', prefill: { asset: station.asset!.id, kind: 'Corrective', priority: station.state === 'alarm' ? 'P2' : 'P3', due: today } })}>
                  <Wrench aria-hidden className="size-4" /> Work order
                </Button>
              )}
              <Button variant="card" size="sm" onClick={() => open({ mode: 'create', type: 'mes.downtime', prefill: { workcenter: station.wc.id, date: today } })}>
                <Timer aria-hidden className="size-4" /> Catat downtime
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
