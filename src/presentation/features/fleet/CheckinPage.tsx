import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, ScanFace, ShieldAlert, Wine, XCircle } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { perDay } from '@/domain/kpi'
import { allowedTransitions, canCreate, type ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { LineChart } from '../../charts/LineChart'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Select } from '../../ui/Field'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/useToast'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, refTitle } from '../../records/text'
import { KpiTile } from '../mes/KpiTile'
import { ScoreRing } from './ScoreRing'

const KINDS = [
  { value: 'Pre-trip P2H', label: 'Pre-trip P2H' },
  { value: 'Gate in', label: 'Gate in' },
  { value: 'Gate out', label: 'Gate out' },
] as const
const LOG_TABS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Waiting' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'blocked', label: 'Blocked' },
] as const

/** DSM face with a scan line while scanning and slow blinks once the score is in. */
function FaceScan({ scanning, score }: { scanning: boolean; score: number | null }) {
  const tired = (score ?? 0) > 60
  return (
    <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0" role="img" aria-label={scanning ? 'Scanning driver face' : 'Driver face'}>
      <rect x="4" y="4" width="152" height="152" rx="22" className="fill-ink" />
      <ellipse cx="80" cy="78" rx="38" ry="48" className="fill-none stroke-on-ink-muted" strokeWidth="2" />
      <g className={cn(!scanning && tired && 'animate-blink')}>
        <ellipse cx="65" cy="70" rx="7" ry={tired ? 2.5 : 5} className="fill-on-ink" />
        <ellipse cx="95" cy="70" rx="7" ry={tired ? 2.5 : 5} className="fill-on-ink" />
      </g>
      <path d="M66 102 Q80 110 94 102" className="fill-none stroke-on-ink-muted" strokeWidth="2" strokeLinecap="round" />
      {([[30, 24], [130, 24], [30, 132], [130, 132]] as const).map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y + (y < 80 ? 12 : -12)} V${y} H${x + (x < 80 ? 12 : -12)}`} className={cn('fill-none', score === null ? 'stroke-info' : tired ? 'stroke-accent' : 'stroke-success')} strokeWidth="3" />
      ))}
      {scanning && <rect x="20" y="4" width="120" height="3" rx="1.5" className="animate-scan fill-info" />}
    </svg>
  )
}

/** P2H and gate check-in: a driver-side form with a DSM fatigue scan and breath test, then the gate log. */
export default function CheckinPage() {
  const { records } = useServices()
  const { role } = useSession()
  const accessFor = useAccess()
  const toast = useToast()
  const all = useAllRecords()
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('Pre-trip P2H')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [location, setLocation] = useState('LOC-0001')
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [alcohol, setAlcohol] = useState<'Negative' | 'Positive'>('Negative')
  const [fatigue, setFatigue] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [logTab, setLogTab] = useState<(typeof LOG_TABS)[number]['value']>('all')

  const items = useMemo(() => all.data?.['tms.p2h'] ?? [], [all.data])
  const groups = useMemo(() => [...new Set(items.map((i) => String(i.values.category)))], [items])

  if (!all.data) return <CardSkeleton lines={8} />
  const type = typeOf('tms.checkins')!
  const checkins = [...(all.data['tms.checkins'] ?? [])].sort((a, b) => `${b.values.date} ${b.values.time}`.localeCompare(`${a.values.date} ${a.values.time}`))
  const today = new Date().toISOString().slice(0, 10)
  const todays = checkins.filter((c) => c.values.date === today)
  const log = checkins.filter((c) => logTab === 'all' || c.status === logTab)
  const criticalFailed = items.filter((i) => failed.has(i.id) && i.values.critical === 'Yes')
  const reasons = [
    alcohol === 'Positive' && 'Breath alcohol positive',
    fatigue !== null && fatigue > 60 && `DSM fatigue ${fatigue}/100 above 60`,
    failed.size > 0 && `${failed.size} check${failed.size > 1 ? 's' : ''} failed${criticalFailed.length ? `, ${criticalFailed.length} critical` : ''}`,
  ].filter(Boolean) as string[]
  const fit = reasons.length === 0
  const access = accessFor('tms')
  const options = (key: string) => (all.data?.[key] ?? []).map((r) => ({ value: r.id, label: refTitle(key, r.id, all.data) }))

  function scan() {
    setScanning(true)
    setFatigue(null)
    window.setTimeout(() => {
      setScanning(false)
      setFatigue(8 + Math.round(Math.random() * 64))
    }, 2200)
  }

  async function submit() {
    if (!vehicle || !driver) {
      toast({ tone: 'danger', title: 'Pick a vehicle and a driver first' })
      return
    }
    setBusy('submit')
    try {
      const now = new Date()
      const saved = await records.create(role, 'tms.checkins', {
        kind,
        vehicle,
        driver,
        location,
        date: today,
        time: now.toTimeString().slice(0, 5),
        alcohol,
        fatigue: fatigue ?? 0,
        passed: items.length - failed.size,
        total: items.length,
      })
      toast({ title: `Check-in ${saved.id} submitted`, description: fit ? 'Fit to drive. It waits for the dispatcher to clear it.' : `On hold: ${reasons.join('; ')}.` })
      setFailed(new Set())
      setFatigue(null)
      setAlcohol('Negative')
    } catch (e) {
      toast({ tone: 'danger', title: 'Not submitted', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  async function decide(c: ErpRecord, to: string) {
    setBusy(c.id)
    try {
      await records.transition(role, 'tms.checkins', c.id, to)
      toast({ title: `${c.id} ${to === 'cleared' ? 'cleared to depart' : 'blocked'}` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not changed', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label="Check-ins today" value={todays.length} format={(v) => String(Math.round(v))} to={recordPath(type)} accent />
        <KpiTile label="Fit to drive (all time)" value={checkins.filter((c) => c.values.readiness === 'Fit to drive').length} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?f=Fit to drive`} />
        <KpiTile label="On hold" value={checkins.filter((c) => c.values.readiness === 'Hold').length} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?q=Hold`} />
        <KpiTile label="Alcohol positive" value={checkins.filter((c) => c.values.alcohol === 'Positive').length} format={(v) => String(Math.round(v))} to={`${recordPath(type)}?q=Positive`} note="last 20 days" />
      </div>

      <Card>
        <CardHeader title="Check-ins per day, 3 weeks" />
        <LineChart
          labels={perDay([], today, 21, () => '').map((x) => x.day.slice(8))}
          series={[
            { id: 'all', label: 'Check-ins', values: perDay(checkins, today, 21, (c) => String(c.values.date)).map((x) => x.count), color: 'var(--color-series-2)', area: true },
            { id: 'hold', label: 'On hold', values: perDay(checkins.filter((c) => c.values.readiness === 'Hold'), today, 21, (c) => String(c.values.date)).map((x) => x.count), color: 'var(--color-series-1)' },
          ]}
          format={(v) => `${v}`}
          height={180}
          label="Check-ins and holds per day"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="New check-in" action={<Tabs label="Check-in type" options={KINDS} value={kind} onChange={setKind} />} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select className="w-full" aria-label="Vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} options={[{ value: '', label: 'Vehicle' }, ...options('tms.vehicles')]} />
            <Select className="w-full" aria-label="Driver" value={driver} onChange={(e) => setDriver(e.target.value)} options={[{ value: '', label: 'Driver' }, ...options('tms.drivers')]} />
            <Select className="w-full" aria-label="Location" value={location} onChange={(e) => setLocation(e.target.value)} options={options('tms.locations')} />
          </div>

          {kind === 'Pre-trip P2H' && (
            <div className="mt-5 space-y-4">
              <p className="text-xs text-muted">Tap a check to mark it failed. Red-edged checks block departure.</p>
              {groups.map((g) => (
                <div key={g}>
                  <p className="eyebrow mb-1.5">{g}</p>
                  <div className="flex flex-wrap gap-2">
                    {items
                      .filter((i) => i.values.category === g)
                      .map((i) => {
                        const bad = failed.has(i.id)
                        return (
                          <button
                            key={i.id}
                            type="button"
                            aria-pressed={!bad}
                            onClick={() => setFailed((s) => {
                              const next = new Set(s)
                              if (next.has(i.id)) next.delete(i.id)
                              else next.add(i.id)
                              return next
                            })}
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95',
                              bad ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong bg-raised text-fg hover:bg-control',
                              i.values.critical === 'Yes' && !bad && 'border-l-4 border-l-accent',
                            )}
                          >
                            {bad ? <XCircle aria-hidden className="size-3.5" /> : <CheckCircle2 aria-hidden className="size-3.5 text-success" />}
                            {String(i.values.item)}
                          </button>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 rounded-panel bg-raised p-4">
              <FaceScan scanning={scanning} score={fatigue} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">DSM fatigue scan</p>
                <p className="text-xs text-muted">The cabin camera checks eyelid closure and yawning for 2 seconds.</p>
                <div className="mt-3 flex items-center gap-3">
                  {fatigue !== null && <ScoreRing value={100 - fatigue} size={52} label="Alertness" />}
                  <Button size="sm" variant="solid" loading={scanning} onClick={scan}>
                    <ScanFace aria-hidden className="size-3.5" /> {fatigue === null ? 'Run scan' : 'Scan again'}
                  </Button>
                </div>
                {fatigue !== null && <p className="mt-1 text-xs text-muted">Fatigue {fatigue}/100 · alertness shown in the ring</p>}
              </div>
            </div>
            <div className="rounded-panel bg-raised p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Wine aria-hidden className="size-4" /> Breath alcohol test
              </p>
              <div role="radiogroup" aria-label="Breath alcohol result" className="mt-3 grid grid-cols-2 gap-2">
                {(['Negative', 'Positive'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={alcohol === v}
                    onClick={() => setAlcohol(v)}
                    className={cn('h-10 cursor-pointer rounded-full text-sm font-medium transition-colors', alcohol === v ? (v === 'Positive' ? 'bg-accent-strong text-white' : 'bg-invert text-on-invert') : 'bg-control text-muted hover:text-fg')}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div key={fit ? 'fit' : reasons.join()} className={cn('animate-slide-down mt-5 flex flex-wrap items-center gap-3 rounded-panel p-4', fit ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-text')}>
            {fit ? <CheckCircle2 aria-hidden className="size-6" /> : <ShieldAlert aria-hidden className="size-6" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{fit ? 'Fit to drive' : 'Hold the departure'}</p>
              <p className="text-xs opacity-80">{fit ? 'Every check passed so far.' : reasons.join(' · ')}</p>
            </div>
            <Button variant={fit ? 'solid' : 'accent'} loading={busy === 'submit'} disabled={!canCreate(type, access)} onClick={submit}>
              Submit check-in
            </Button>
          </div>
        </Card>

        <Card className="p-0 xl:col-span-2">
          <div className="space-y-3 px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold">Gate log</h2>
            <Tabs label="Filter the gate log" options={LOG_TABS} value={logTab} onChange={setLogTab} variant="underline" />
          </div>
          <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
            {log.slice(0, 40).map((c) => {
              const moves = allowedTransitions(type, c.status, access)
              return (
                <li key={c.id} className="animate-slide-down px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', c.values.readiness === 'Hold' ? 'bg-accent' : 'bg-success')} />
                    <Link to={recordPath(type, c.id)} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate text-sm font-medium">
                        {refTitle('tms.vehicles', String(c.values.vehicle), all.data).split(' · ')[0]} · {refTitle('tms.drivers', String(c.values.driver), all.data).split(' · ')[0]}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {String(c.values.kind)} · {String(c.values.date)} {String(c.values.time)} · {String(c.values.readiness)}
                      </span>
                    </Link>
                    <StateBadge type={type} status={c.status} />
                  </div>
                  {moves.length > 0 && (
                    <div className="mt-2 flex gap-2 pl-5">
                      {moves.map((m) => (
                        <Button key={m.to} size="sm" variant={m.to === 'blocked' ? 'soft' : 'solid'} loading={busy === c.id} onClick={() => decide(c, m.to)}>
                          {m.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}

