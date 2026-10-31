import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { divIcon } from 'leaflet'
import { Marker, Polyline, Tooltip } from 'react-leaflet'
import { Activity, ArrowLeft, Cpu, Droplet, FileText, Fuel, Gauge, PhoneCall, Satellite, Search, Thermometer, Timer } from 'lucide-react'
import { countBy } from '@/domain/erp'
import { pointAlong, SPEED_LIMIT, TRUCK_LABEL, type Truck, type TruckState } from '@/domain/ops'
import { truckTelemetry } from '@/domain/telemetry'
import { cn } from '@/lib/cn'
import { LineChart } from '../../charts/LineChart'
import { useQueryState } from '../../hooks/useParams'
import { useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useTicker } from '../../hooks/useTicker'
import { BaseMap } from '../../maps/BaseMap'
import { SiteMarkers } from '../../maps/SiteMarkers'
import { StatusPill, type Tone } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { FactGrid } from '../../ui/Headline'
import { Meter } from '../../ui/Meter'
import { Skeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { NewButtons } from '../../records/NewButtons'
import { Tabs } from '../../ui/Tabs'
import { KpiTile } from '../mes/KpiTile'
import { ScadaMarkers, ScadaSitePanel, ScadaTable, useScadaSites } from './Scada'

const STATE_TONE: Record<TruckState, Tone> = { moving: 'success', loading: 'neutral', alert: 'danger' }
const STATES = (Object.keys(TRUCK_LABEL) as TruckState[]).map((value) => ({ value, label: TRUCK_LABEL[value] }))
const LAYERS = [
  { key: 'trucks', label: 'Truk' },
  { key: 'routes', label: 'Rute' },
  { key: 'scada', label: 'SCADA' },
] as const
const TRENDS = [
  { value: 'speed', label: 'Kecepatan' },
  { value: 'temp', label: 'Suhu tangki' },
  { value: 'pressure', label: 'Tekanan' },
] as const
const TEMP_LIMIT = 45
const PRESSURE_LIMIT = 3.5

/** One icon per look, built once, so ticking positions never rebuild marker DOM. */
const ICONS = new Map<string, ReturnType<typeof divIcon>>()
function truckIcon(state: TruckState, selected: boolean) {
  const key = `${state}-${selected}`
  let icon = ICONS.get(key)
  if (!icon) {
    const fill = state === 'alert' ? 'bg-accent text-white' : state === 'loading' ? 'bg-control text-muted' : 'bg-invert text-on-invert'
    const ping = state === 'alert' || selected ? '<span class="absolute inset-0 rounded-full border-2 border-accent animate-ping-ring"></span>' : ''
    const size = selected ? 'size-9' : 'size-7'
    icon = divIcon({
      className: '',
      iconSize: selected ? [36, 36] : [28, 28],
      html: `<span class="relative grid ${size} place-items-center rounded-full ${fill} shadow-float ring-2 ring-card">${ping}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>`,
    })
    ICONS.set(key, icon)
  }
  return icon
}

/** Live position and speed: moving trucks advance along the route at a pace set by their speed. */
function live(t: Truck, elapsed: number, i: number) {
  if (t.state === 'loading') return { progress: t.progress, speed: 0 }
  const progress = (t.progress + (elapsed * t.speed) / SPEED_LIMIT / 300) % 1
  return { progress, speed: Math.max(0, Math.round(t.speed + 3 * Math.sin(elapsed / 2 + i))) }
}

export default function FleetPage() {
  const { ops, erp } = useServices()
  const toast = useToast()
  const navigate = useNavigate()
  const trucks = useResource('ops.trucks', () => ops.trucks())
  const sites = useResource('ops.sites', () => ops.sites())
  const entities = useResource('erp.entities', () => erp.entities())
  const [query, setQuery] = useQueryState(['truck', 'state', 'q', 'site', 'hide'] as const)
  const [trend, setTrend] = useState<(typeof TRENDS)[number]['value']>('speed')
  const elapsed = useTicker()
  const records = useAllRecords()
  const state = query.state as TruckState | undefined

  const all = trucks.data ?? []
  const needle = query.q?.trim().toLowerCase()
  const bySearch = all.filter((t) => !needle || [t.plate, t.driver, t.cargo, t.to].some((s) => s.toLowerCase().includes(needle)))
  const rows = bySearch.filter((t) => !state || t.state === state)
  const picked = all.find((t) => t.id === query.truck)
  const pickedIndex = picked ? all.indexOf(picked) : -1
  const now = picked ? live(picked, elapsed, pickedIndex) : null
  const routeMid = picked ? pointAlong(picked.route, 0.5) : undefined
  const depots = useMemo(() => (sites.data ?? []).filter((s) => s.entity === 'rotama' || s.entity === 'roasi'), [sites.data])
  const scada = useScadaSites(sites.data ?? [])
  const pickedSite = scada.find((x) => x.site.id === query.site)
  const hidden = new Set((query.hide ?? '').split(',').filter(Boolean))
  const toggleLayer = (key: string) => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setQuery({ hide: [...next].join(',') || undefined })
  }
  const speeds = all.map((t, i) => live(t, elapsed, i).speed)
  const tele = picked && now ? truckTelemetry(picked, elapsed, now.speed) : null

  return (
    <div className="space-y-4">
      <NewButtons types={['tms.trips', 'tms.checkins', 'tms.safety']} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Truk bergerak" value={all.filter((t) => t.state !== 'loading').length} format={(v) => String(Math.round(v))} to="/fleet?state=moving" accent note={`${all.length} truk terpantau`} />
        <KpiTile label="Melebihi batas" value={speeds.filter((v) => v > SPEED_LIMIT).length} format={(v) => String(Math.round(v))} to="/fleet/safety" note={`batas ${SPEED_LIMIT} km/h`} />
        <KpiTile label="Alarm suhu tangki" value={all.filter((t) => t.tankTemp > TEMP_LIMIT).length} format={(v) => String(Math.round(v))} to="/fleet?state=alert" note={`di atas ${TEMP_LIMIT} °C`} />
        <KpiTile label="Kecepatan rata-rata" value={speeds.filter(Boolean).reduce((a, b) => a + b, 0) / Math.max(1, speeds.filter(Boolean).length)} format={(v) => `${Math.round(v)} km/h`} to="/modules/tms/telemetry" note="truk yang bergerak" />
        <KpiTile label="SCADA terhubung" value={scada.filter((x) => x.integrated && x.state === 'connected').length} format={(v) => `${Math.round(v)}/${scada.length}`} to="/modules/occ/sources" note={`${scada.filter((x) => x.state !== 'connected' || !x.integrated).length} lokasi perlu dicek`} />
        <KpiTile label="Telemetri tangki" value={(records.data?.['tms.telemetry'] ?? []).filter((r) => r.status === 'logged' && r.values.alarm === 'Alarm').length} format={(v) => String(Math.round(v))} to="/modules/tms/telemetry?status=logged" note="alarm belum ditinjau" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-3 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
            <span className="text-xs font-medium text-muted">Lapisan peta</span>
            {LAYERS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={!hidden.has(l.key)}
                onClick={() => toggleLayer(l.key)}
                className={cn('h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors', hidden.has(l.key) ? 'bg-raised text-muted' : 'bg-invert text-on-invert')}
              >
                {l.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success" /> terhubung</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-warning" /> terganggu</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-danger" /> terputus</span>
            </span>
          </div>
          {trucks.data && entities.data ? (
            <BaseMap
              center={[-6.6, 109.2]}
              zoom={6}
              focus={pickedSite ? { at: pickedSite.site.at, zoom: 9 } : routeMid ? { at: routeMid, zoom: 8 } : { at: [-6.6, 109.2], zoom: 6 }}
              className="h-[460px] xl:h-[640px]"
              label="Live fleet map"
            >
              {hidden.has('scada') && <SiteMarkers sites={depots} entities={entities.data} onSelect={(id) => navigate(`/entities/${depots.find((d) => d.id === id)?.entity ?? ''}`)} />}
              {!hidden.has('scada') && <ScadaMarkers sites={scada} picked={query.site} onPick={(id) => setQuery({ site: id, truck: undefined })} />}
              {!hidden.has('routes') && rows.map((t) => (
                <Polyline
                  key={`r-${t.id}`}
                  positions={t.route.map((p) => [p[0], p[1]] as [number, number])}
                  pathOptions={{ className: t.id === query.truck ? 'mark-route-active' : 'mark-route', weight: t.id === query.truck ? 4 : 3 }}
                />
              ))}
              {!hidden.has('trucks') && rows.map((t) => {
                const i = all.indexOf(t)
                const at = pointAlong(t.route, live(t, elapsed, i).progress)
                return (
                  <Marker
                    key={t.id}
                    position={[at[0], at[1]]}
                    icon={truckIcon(t.state, t.id === query.truck)}
                    zIndexOffset={t.id === query.truck ? 1000 : t.state === 'alert' ? 500 : 0}
                    eventHandlers={{ click: () => setQuery({ truck: t.id === query.truck ? undefined : t.id, site: undefined }) }}
                  >
                    <Tooltip direction="top" offset={[0, -14]}>
                      {t.plate} · {t.cargo}
                    </Tooltip>
                  </Marker>
                )
              })}
            </BaseMap>
          ) : (
            <Skeleton className="h-[460px] rounded-panel xl:h-[640px]" />
          )}
        </Card>

        {pickedSite ? (
          <ScadaSitePanel key={pickedSite.site.id} scada={pickedSite} elapsed={elapsed} onBack={() => setQuery({ site: undefined })} />
        ) : picked && now ? (
          <Card key={picked.id} className="animate-rise">
            <div className="mb-4 flex items-center justify-between gap-2">
              <Button variant="soft" size="sm" onClick={() => setQuery({ truck: undefined })}>
                <ArrowLeft aria-hidden className="size-3.5" /> Semua truk
              </Button>
              <StatusPill tone={STATE_TONE[picked.state]}>{TRUCK_LABEL[picked.state]}</StatusPill>
            </div>
            <p className="font-mono text-xs text-muted">{picked.manifest}</p>
            <h2 className="text-2xl font-bold tracking-tight">
              {picked.plate}
              <span className="text-accent">.</span>
            </h2>
            <p className="text-sm text-body">
              {picked.from} → {picked.to} · {picked.driver}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { icon: Gauge, label: 'Kecepatan', value: `${now.speed}`, unit: 'km/h', bad: now.speed > SPEED_LIMIT },
                { icon: Thermometer, label: 'Suhu tangki', value: `${picked.tankTemp}`, unit: '°C', bad: picked.state === 'alert' && picked.tankTemp > 45 },
                { icon: Gauge, label: 'Tekanan tangki', value: picked.tankPressure.toFixed(1), unit: 'bar', bad: false },
              ].map((m) => (
                <div key={m.label} className={cn('rounded-panel p-3', m.bad ? 'bg-accent-soft text-accent-text' : 'bg-raised')}>
                  <m.icon aria-hidden className="size-4 opacity-60" />
                  <p className="mt-2 text-xl font-semibold tabular">{m.value}</p>
                  <p className="text-[11px] opacity-70">
                    {m.label}, {m.unit}
                  </p>
                </div>
              ))}
            </div>

            {tele && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { icon: Fuel, label: 'Solar', value: `${tele.fuel}`, unit: '%', bad: tele.fuel < 20 },
                  { icon: Cpu, label: 'Putaran mesin', value: `${tele.rpm}`, unit: 'rpm', bad: tele.rpm > 2200 },
                  { icon: Droplet, label: 'Suhu mesin', value: `${tele.coolant}`, unit: '°C', bad: tele.coolant > 95 },
                  { icon: Satellite, label: 'Satelit GPS', value: `${tele.gpsSats}`, unit: 'sat', bad: tele.gpsSats < 8 },
                  { icon: Timer, label: 'Sinyal terakhir', value: `${tele.pingSec}`, unit: 'dtk', bad: tele.pingSec > 8 },
                  { icon: Activity, label: 'Kelelahan sopir', value: `${tele.fatigue}`, unit: 'skor', bad: tele.fatigue > 70 },
                ].map((m) => (
                  <div key={m.label} className={cn('rounded-panel p-2.5', m.bad ? 'bg-accent-soft text-accent-text' : 'bg-raised')}>
                    <m.icon aria-hidden className="size-3.5 opacity-60" />
                    <p className="mt-1 text-lg font-semibold tabular">{m.value}</p>
                    <p className="text-[11px] opacity-70">
                      {m.label}, {m.unit}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{picked.from}</span>
                <span className="tabular">{Math.round(now.progress * 100)}%</span>
                <span>{picked.to}</span>
              </div>
              <Meter value={now.progress} tone="accent" label="Trip progress" />
            </div>

            <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Tren 12 pembacaan terakhir</p>
              <Tabs label="Tren telemetri" variant="underline" options={TRENDS} value={trend} onChange={setTrend} />
            </div>
            <LineChart
              key={trend}
              labels={picked.speedTrace.map((_, i) => `-${(11 - i) * 5}m`)}
              series={[
                {
                  id: trend,
                  label: TRENDS.find((x) => x.value === trend)!.label,
                  values: trend === 'speed' ? picked.speedTrace : trend === 'temp' ? (tele?.tempTrace ?? []) : (tele?.pressureTrace ?? []),
                  color: trend === 'speed' ? 'var(--color-series-1)' : trend === 'temp' ? 'var(--color-series-3)' : 'var(--color-series-2)',
                  area: true,
                },
                { id: 'limit', label: 'Batas', values: picked.speedTrace.map(() => (trend === 'speed' ? SPEED_LIMIT : trend === 'temp' ? TEMP_LIMIT : PRESSURE_LIMIT)), color: 'var(--color-series-other)', muted: true },
              ]}
              format={(v) => (trend === 'speed' ? `${v} km/h` : trend === 'temp' ? `${v} °C` : `${v} bar`)}
              max={trend === 'speed' ? 110 : trend === 'temp' ? 60 : 5}
              height={150}
              onPick={() => navigate(`/modules/tms/trips?q=${encodeURIComponent(picked.plate)}`)}
              label={`${picked.plate} speed trace`}
            />

            <FactGrid
              className="mt-4 grid-cols-2"
              facts={[
                ['Cargo', picked.cargo],
                ['Hazard', picked.hazard],
                ['DG certificate', picked.certExpiry],
                ['Manifest', picked.manifest],
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="solid" size="sm" onClick={() => toast({ title: `Demo call to ${picked.driver}`, description: 'No phone line is connected.' })}>
                <PhoneCall aria-hidden className="size-3.5" /> Simulate call
              </Button>
              <Button variant="soft" size="sm" onClick={() => toast({ title: `Manifest ${picked.manifest} simulated`, description: 'No submission was sent to KLHK or Kemenhub.' })}>
                <FileText aria-hidden className="size-3.5" /> Simulate manifest send
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-0">
            <div className="space-y-3 border-b border-line p-4">
              <CardHeader title="Tankers" className="mb-0" />
              <FilterChips label="Filter by state" options={STATES} value={state} counts={countBy(bySearch, (t) => t.state)} total={bySearch.length} onChange={(v) => setQuery({ state: v })} />
              <Input
                className="h-10 w-full"
                icon={<Search className="size-4" />}
                placeholder="Plate, driver, cargo, destination"
                aria-label="Search trucks"
                value={query.q ?? ''}
                onChange={(e) => setQuery({ q: e.target.value })}
              />
            </div>
            <ul className="divide-y divide-line">
              {rows.map((t) => {
                const i = all.indexOf(t)
                const n = live(t, elapsed, i)
                return (
                  <li key={t.id} data-motion="row">
                    <button type="button" onClick={() => setQuery({ truck: t.id, site: undefined })} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-raised">
                      <span className={cn('size-2.5 shrink-0 rounded-full', t.state === 'alert' ? 'bg-accent' : t.state === 'loading' ? 'bg-subtle' : 'bg-fg')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{t.plate}</span>
                        <span className="block truncate text-xs text-muted">
                          {t.cargo} · to {t.to}
                        </span>
                      </span>
                      <span className={cn('text-sm font-medium tabular', n.speed > SPEED_LIMIT && 'text-accent-text')}>{n.speed} km/h</span>
                    </button>
                  </li>
                )
              })}
              {rows.length === 0 && (
                <li className="p-6 text-center text-sm text-muted">
                  No truck matches.{' '}
                  <button type="button" className="cursor-pointer font-semibold text-fg underline" onClick={() => setQuery({ state: undefined, q: undefined })}>
                    Clear filters
                  </button>
                </li>
              )}
            </ul>
          </Card>
        )}
      </div>
      <ScadaTable sites={scada} elapsed={elapsed} onPick={(id) => setQuery({ site: id, truck: undefined })} />
    </div>
  )
}
