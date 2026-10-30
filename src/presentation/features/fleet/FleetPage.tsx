import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { divIcon } from 'leaflet'
import { Marker, Polyline, Tooltip } from 'react-leaflet'
import { ArrowLeft, FileText, Gauge, PhoneCall, Search, Thermometer } from 'lucide-react'
import { countBy } from '@/domain/erp'
import { pointAlong, SPEED_LIMIT, TRUCK_LABEL, type Truck, type TruckState } from '@/domain/ops'
import { cn } from '@/lib/cn'
import { LineChart } from '../../charts/LineChart'
import { useQueryState } from '../../hooks/useParams'
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

const STATE_TONE: Record<TruckState, Tone> = { moving: 'success', loading: 'neutral', alert: 'danger' }
const STATES = (Object.keys(TRUCK_LABEL) as TruckState[]).map((value) => ({ value, label: TRUCK_LABEL[value] }))

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
  const [query, setQuery] = useQueryState(['truck', 'state', 'q'] as const)
  const elapsed = useTicker()
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

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="p-3 xl:col-span-2">
        {trucks.data && entities.data ? (
          <BaseMap
            center={[-6.6, 109.2]}
            zoom={6}
            focus={routeMid ? { at: routeMid, zoom: 8 } : { at: [-6.6, 109.2], zoom: 6 }}
            className="h-[460px] xl:h-[640px]"
            label="Live fleet map"
          >
            <SiteMarkers sites={depots} entities={entities.data} onSelect={(id) => navigate(`/entities/${depots.find((d) => d.id === id)?.entity ?? ''}`)} />
            {rows.map((t) => (
              <Polyline
                key={`r-${t.id}`}
                positions={t.route.map((p) => [p[0], p[1]] as [number, number])}
                pathOptions={{ className: t.id === query.truck ? 'mark-route-active' : 'mark-route', weight: t.id === query.truck ? 4 : 3 }}
              />
            ))}
            {rows.map((t) => {
              const i = all.indexOf(t)
              const at = pointAlong(t.route, live(t, elapsed, i).progress)
              return (
                <Marker
                  key={t.id}
                  position={[at[0], at[1]]}
                  icon={truckIcon(t.state, t.id === query.truck)}
                  zIndexOffset={t.id === query.truck ? 1000 : t.state === 'alert' ? 500 : 0}
                  eventHandlers={{ click: () => setQuery({ truck: t.id === query.truck ? undefined : t.id }) }}
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

      {picked && now ? (
        <Card key={picked.id} className="animate-rise">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button variant="soft" size="sm" onClick={() => setQuery({ truck: undefined })}>
              <ArrowLeft aria-hidden className="size-3.5" /> All trucks
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
              { icon: Gauge, label: 'Speed', value: `${now.speed}`, unit: 'km/h', bad: now.speed > SPEED_LIMIT },
              { icon: Thermometer, label: 'Tank temp', value: `${picked.tankTemp}`, unit: '°C', bad: picked.state === 'alert' && picked.tankTemp > 45 },
              { icon: Gauge, label: 'Pressure', value: picked.tankPressure.toFixed(1), unit: 'bar', bad: false },
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

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{picked.from}</span>
              <span className="tabular">{Math.round(now.progress * 100)}%</span>
              <span>{picked.to}</span>
            </div>
            <Meter value={now.progress} tone="accent" label="Trip progress" />
          </div>

          <p className="mt-5 mb-2 text-sm font-semibold">Speed, last 12 readings</p>
          <LineChart
            labels={picked.speedTrace.map((_, i) => `-${(11 - i) * 5}m`)}
            series={[
              { id: 'speed', label: 'Speed', values: picked.speedTrace, color: 'var(--color-series-1)', area: true },
              { id: 'limit', label: 'Limit', values: picked.speedTrace.map(() => SPEED_LIMIT), color: 'var(--color-series-other)', muted: true },
            ]}
            format={(v) => `${v} km/h`}
            max={110}
            height={150}
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
            <Button variant="solid" size="sm" onClick={() => toast({ title: `Call placed to ${picked.driver}`, description: 'Demo: no phone line is connected.' })}>
              <PhoneCall aria-hidden className="size-3.5" /> Call driver
            </Button>
            <Button variant="soft" size="sm" onClick={() => toast({ title: `Manifest ${picked.manifest} sent`, description: 'Demo: KLHK and Kemenhub submission is simulated.' })}>
              <FileText aria-hidden className="size-3.5" /> Send B3 manifest
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
                  <button type="button" onClick={() => setQuery({ truck: t.id })} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-raised">
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
  )
}
