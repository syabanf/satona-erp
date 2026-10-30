import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Eye, Radar, Zap } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { byHour, pareto, perDay, safetyScores, shiftDay } from '@/domain/kpi'
import { allowedTransitions, canCreate, type ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { LineChart } from '../../charts/LineChart'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/useToast'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, refTitle, dayQuery } from '../../records/text'
import { KpiTile } from '../mes/KpiTile'
import { ScoreRing } from './ScoreRing'
import { NewButtons } from '../../records/NewButtons'

const SOURCES = [
  { value: 'all', label: 'All events' },
  { value: 'ADAS', label: 'ADAS' },
  { value: 'DSM', label: 'DSM' },
] as const
const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const
const SEVERITY_DOT: Record<string, string> = { Critical: 'bg-accent', High: 'bg-warning', Medium: 'bg-info', Low: 'bg-subtle' }

/** The camera frame for an event: the road ahead for ADAS, the cabin for DSM, both animated. */
function CameraFrame({ e }: { e: ErpRecord }) {
  const dsm = e.values.source === 'DSM'
  const speed = Number(e.values.speed ?? 0)
  return (
    <svg viewBox="0 0 320 180" className="w-full rounded-panel" role="img" aria-label={`${dsm ? 'Cabin' : 'Road'} camera frame, ${String(e.values.event)}`}>
      <rect width="320" height="180" className="fill-ink" />
      {dsm ? (
        <g>
          <ellipse cx="160" cy="95" rx="46" ry="58" className="fill-none stroke-on-ink-muted" strokeWidth="2" />
          <g className="animate-blink">
            <ellipse cx="142" cy="85" rx="8" ry="4" className="fill-on-ink" />
            <ellipse cx="178" cy="85" rx="8" ry="4" className="fill-on-ink" />
          </g>
          {String(e.values.event) === 'Phone use' && <rect x="196" y="92" width="16" height="30" rx="3" className="fill-warning" transform="rotate(-18 204 107)" />}
          <rect x="104" y="28" width="112" height="130" rx="6" className="fill-none stroke-accent" strokeWidth="2.5" strokeDasharray="10 6" />
          <text x="108" y="22" className="fill-accent text-[11px] font-semibold">{String(e.values.event).toUpperCase()}</text>
        </g>
      ) : (
        <g>
          <path d="M0 180 L130 70 L190 70 L320 180 Z" className="fill-hover/10" />
          <line x1="160" y1="180" x2="160" y2="72" className="animate-lane stroke-on-ink" strokeWidth="3" strokeDasharray="14 12" />
          <line x1="40" y1="180" x2="135" y2="72" className="stroke-on-ink-muted" strokeWidth="2" />
          <line x1="280" y1="180" x2="185" y2="72" className="stroke-on-ink-muted" strokeWidth="2" />
          <rect x="140" y="92" width="44" height="30" rx="4" className="fill-on-ink-muted" />
          <rect x="134" y="86" width="56" height="42" rx="4" className="fill-none stroke-accent" strokeWidth="2.5" />
          <text x="134" y="80" className="fill-accent text-[11px] font-semibold">{String(e.values.event).toUpperCase()}</text>
        </g>
      )}
      <text x="12" y="168" className="fill-on-ink text-[11px] font-semibold">{speed} km/h · {String(e.values.place ?? '')}</text>
      <circle cx="300" cy="16" r="5" className="animate-pulse fill-accent" />
      <text x="262" y="20" className="fill-on-ink text-[10px]">REC</text>
    </svg>
  )
}

/** Fleet safety from in-cab ADAS and DSM cameras: event stream, hot hours, driver scores and the review workflow. */
export default function SafetyPage() {
  const navigate = useNavigate()
  const { records, clock } = useServices()
  const today = clock.today()
  const { role } = useSession()
  const accessFor = useAccess()
  const toast = useToast()
  const all = useAllRecords()
  const [source, setSource] = useState<(typeof SOURCES)[number]['value']>('all')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('7')
  const [hour, setHour] = useState<number | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  // The stream rotates through the newest events so the wall screen keeps moving.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 3500)
    return () => window.clearInterval(id)
  }, [])

  const events = useMemo(() => {
    const from = new Date(Date.now() - (Number(period) - 1) * 86_400_000).toISOString().slice(0, 10)
    return (all.data?.['tms.safety'] ?? [])
      .filter((e) => String(e.values.date) >= from && (source === 'all' || e.values.source === source))
      .sort((a, b) => `${b.values.date}${String(b.values.hour).padStart(2, '0')}`.localeCompare(`${a.values.date}${String(a.values.hour).padStart(2, '0')}`))
  }, [all.data, period, source])

  if (!all.data) return <CardSkeleton lines={8} />
  const type = typeOf('tms.safety')!
  const shown = hour === null ? events : events.filter((e) => Number(e.values.hour) === hour)
  const hours = byHour(events)
  const hourMax = Math.max(1, ...hours)
  const kinds = pareto(shown.map((e) => ({ key: String(e.values.event), value: 1 })))
  const scores = safetyScores(shown).slice(0, 8)
  const stream = shown.length ? Array.from({ length: Math.min(6, shown.length) }, (_, i) => shown[(tick + i) % shown.length]!) : []
  const selected = shown.find((e) => e.id === picked) ?? shown[0]
  const access = accessFor('tms')

  async function move(e: ErpRecord, to: string) {
    setBusy(true)
    try {
      await records.transition(role, 'tms.safety', e.id, to)
      toast({ title: `${e.id} moved to ${type.workflow.states.find((s) => s.id === to)?.label ?? to}` })
    } catch (err) {
      toast({ tone: 'danger', title: 'Not changed', description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function simulate() {
    const vehicles = all.data?.['tms.vehicles'] ?? []
    const drivers = all.data?.['tms.drivers'] ?? []
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]
    try {
      const saved = await records.create(role, 'tms.safety', {
        event: pick(['Drowsiness', 'Phone use', 'Headway too close', 'Lane departure', 'Forward collision warning']),
        vehicle: pick(vehicles)?.id,
        driver: pick(drivers)?.id,
        severity: pick(['Medium', 'High', 'Critical']),
        speed: 60 + Math.round(Math.random() * 30),
        date: new Date().toISOString().slice(0, 10),
        hour: new Date().getHours(),
        place: 'Tol Jakarta-Merak KM 42',
      })
      setPeriod('1')
      setSource('all')
      setPicked(saved.id)
      toast({ tone: 'danger', title: `${String(saved.values.event)} on ${refTitle('tms.vehicles', String(saved.values.vehicle), all.data).split(' · ')[0]}`, description: `${saved.id} arrived from the in-cab camera.` })
    } catch (err) {
      toast({ tone: 'danger', title: 'Not simulated', description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="space-y-4">
      <NewButtons types={['tms.safety']} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs label="Event source" options={SOURCES} value={source} onChange={setSource} />
        <Tabs label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        {hour !== null && (
          <Button size="sm" variant="ghost" onClick={() => setHour(null)}>
            Hour {hour}:00 · clear
          </Button>
        )}
        {canCreate(type, access) && (
          <Button size="sm" variant="accent" className="ml-auto" onClick={simulate}>
            <Zap aria-hidden className="size-3.5" /> Simulate live event
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label="Events" value={shown.length} format={(v) => String(Math.round(v))} to={recordPath(type)} accent />
        <KpiTile label="Critical" value={shown.filter((e) => e.values.severity === 'Critical').length} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?q=Critical`} />
        <KpiTile label="Waiting for review" value={shown.filter((e) => e.status === 'new').length} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?status=new`} />
        <KpiTile label="Drivers coached" value={new Set(shown.filter((e) => e.status === 'coached' || e.status === 'closed').map((e) => e.values.driver)).size} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?status=coached`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="relative flex size-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative size-2.5 rounded-full bg-accent" />
              </span>
              Live stream
            </h2>
            <span className="text-xs text-muted">newest events, rotating</span>
          </div>
          <ul className="divide-y divide-line">
            {stream.map((e, i) => (
              <li key={`${e.id}-${tick}-${i}`} className="animate-slide-down" style={{ animationDelay: `${i * 60}ms` }}>
                <button type="button" onClick={() => setPicked(e.id)} className={cn('flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left hover:bg-raised', selected?.id === e.id && 'bg-raised')}>
                  <span className={cn('size-2.5 shrink-0 rounded-full', SEVERITY_DOT[String(e.values.severity)])} />
                  {e.values.source === 'DSM' ? <Eye aria-hidden className="size-4 shrink-0 text-muted" /> : <Radar aria-hidden className="size-4 shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{String(e.values.event)}</span>
                    <span className="block truncate text-xs text-muted">
                      {refTitle('tms.vehicles', String(e.values.vehicle), all.data).split(' · ')[0]} · {String(e.values.date)} {String(e.values.hour).padStart(2, '0')}:00
                    </span>
                  </span>
                  <span className="text-xs tabular text-muted">{String(e.values.speed)} km/h</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          {selected ? (
            <div key={selected.id} className="grid animate-rise gap-4 md:grid-cols-2">
              <CameraFrame e={selected} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-muted">{selected.id}</span>
                  <StateBadge type={type} status={selected.status} />
                  <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium">{String(selected.values.source)}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  {String(selected.values.event)}
                  <span className="text-accent">.</span>
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Driver', refTitle('tms.drivers', String(selected.values.driver), all.data).split(' · ')[0]],
                    ['Vehicle', refTitle('tms.vehicles', String(selected.values.vehicle), all.data).split(' · ')[0]],
                    ['Severity', String(selected.values.severity)],
                    ['Speed', `${String(selected.values.speed)} km/h`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-raised p-2.5">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="truncate font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allowedTransitions(type, selected.status, access).map((m) => (
                    <Button key={m.to} size="sm" variant={m.needs === 'approve' ? 'accent' : 'solid'} loading={busy} onClick={() => move(selected, m.to)}>
                      {m.label}
                    </Button>
                  ))}
                  <Link to={recordPath(type, selected.id)} className="inline-flex h-8 items-center px-2 text-xs font-medium text-accent-text hover:underline">
                    Open record
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No event in this window.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="ADAS and DSM events per day, 30 days" />
        <LineChart
          labels={perDay([], today, 30, () => '').map((x) => x.day.slice(8))}
          series={(['ADAS', 'DSM'] as const).map((src, i) => ({
            id: src,
            label: src,
            values: perDay((all.data?.['tms.safety'] ?? []).filter((e) => e.values.source === src), today, 30, (e) => String(e.values.date)).map((x) => x.count),
            color: i ? 'var(--color-series-1)' : 'var(--color-series-2)',
            area: i === 1,
          }))}
          onPick={(i) => navigate(`/modules/tms/safety${dayQuery(shiftDay(today, i - 29))}`)}
          format={(v) => `${v} events`}
          height={190}
          label="ADAS and DSM events per day"
        />
        <p className="mt-2 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-2" /> ADAS, road ahead</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-1" /> DSM, driver state</span>
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="When events happen" action={<span className="text-xs text-muted">tap an hour to filter</span>} />
          <div className="grid grid-cols-12 gap-1" role="group" aria-label="Events by hour of day">
            {hours.map((n, h) => (
              <button
                key={h}
                type="button"
                aria-pressed={hour === h}
                title={`${h}:00, ${n} events`}
                onClick={() => setHour(hour === h ? null : h)}
                className={cn('flex aspect-square cursor-pointer items-end justify-center rounded-md text-[10px] font-semibold transition-transform hover:scale-110', hour === h ? 'ring-2 ring-fg' : '')}
                style={{ background: n ? `color-mix(in oklab, var(--color-accent) ${15 + (n / hourMax) * 85}%, var(--color-raised))` : 'var(--color-raised)', color: n / hourMax > 0.5 ? 'white' : 'var(--color-muted)' }}
              >
                {h}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Dark cells after midnight usually mean drowsiness on long hauls.</p>
        </Card>
        <Card>
          <CardHeader title="Event types" />
          <ul className="space-y-2.5">
            {kinds.slice(0, 8).map((k) => (
              <li key={k.key}>
                <Link to={`${recordPath(type)}?q=${encodeURIComponent(k.key)}`} className="block hover:opacity-80">
                  <span className="flex justify-between text-sm">
                    <span className="truncate">{k.key}</span>
                    <span className="text-xs text-muted tabular">{k.value}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-control">
                    <span className="block h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${(k.value / (kinds[0]?.value || 1)) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Driver safety score" action={<span className="text-xs text-muted">lowest first</span>} />
          <ul className="grid grid-cols-2 gap-2">
            {scores.map((s) => (
              <li key={s.driver}>
                <Link to={recordPath(typeOf('tms.drivers')!, s.driver)} className="flex items-center gap-2 rounded-xl bg-raised p-2 hover:bg-control">
                  <ScoreRing value={s.score} size={44} label="Safety score" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{refTitle('tms.drivers', s.driver, all.data).split(' · ')[0]}</span>
                    <span className="block text-[11px] text-muted">{s.events} events</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
