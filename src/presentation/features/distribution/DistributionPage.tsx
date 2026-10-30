import { divIcon } from 'leaflet'
import { Circle, Marker, Tooltip } from 'react-leaflet'
import { ChevronRight, Phone, Store } from 'lucide-react'
import { usage, type Distributor, type Region } from '@/domain/ops'
import { cn } from '@/lib/cn'
import { count, percent } from '@/lib/format'
import { useQueryState } from '../../hooks/useParams'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { BaseMap } from '../../maps/BaseMap'
import { Tag } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { FactGrid } from '../../ui/Headline'
import { Meter } from '../../ui/Meter'
import { Skeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { NewButtons } from '../../records/NewButtons'

const HOT = 0.85
const INDONESIA = { at: [-5.2, 111.5] as const, zoom: 5 }

const dot = (on: boolean) =>
  divIcon({
    className: '',
    iconSize: [22, 22],
    html: `<span class="relative grid size-[22px] place-items-center rounded-full ${on ? 'bg-accent text-white' : 'bg-invert text-on-invert'} ring-2 ring-card shadow-float">${on ? '<span class="absolute inset-0 rounded-full border-2 border-accent animate-ping-ring"></span>' : ''}<span class="size-1.5 rounded-full bg-current"></span></span>`,
  })
const DOT = { on: dot(true), off: dot(false) }

function QuotaBars({ r }: { r: Region }) {
  const sub = usage(r.subsidyUsed, r.subsidyQuota)
  const com = usage(r.commercialUsed, r.commercialQuota)
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Subsidised</span>
          <span className="font-medium tabular">
            {count(r.subsidyUsed)} / {count(r.subsidyQuota)} t · {percent(sub, { digits: 0 })}
          </span>
        </div>
        <Meter value={sub} tone={sub > HOT ? 'accent' : 'fg'} label={`${r.name} subsidised quota used`} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Commercial</span>
          <span className="font-medium tabular">
            {count(r.commercialUsed)} / {count(r.commercialQuota)} t · {percent(com, { digits: 0 })}
          </span>
        </div>
        <Meter value={com} tone="info" label={`${r.name} commercial quota used`} />
      </div>
    </div>
  )
}

/** Kiosks under a distributor, generated from its id so they stay put between visits. */
function kiosks(d: Distributor) {
  const names = ['Kios Tani Jaya', 'Kios Subur', 'Kios Makmur', 'Kios Berkah Tani', 'Kios Sri Rejeki', 'Kios Panen Raya']
  return names.map((name, i) => ({ id: `${d.id}-k${i}`, name: `${name} ${d.region.toUpperCase().slice(0, 3)}-${i + 1}`, stock: ((d.kiosks + i * 31) % 40) + 4, open: (i + d.kiosks) % 5 !== 0 }))
}

export default function DistributionPage() {
  const { ops } = useServices()
  const toast = useToast()
  const regions = useResource('ops.regions', () => ops.regions())
  const distributors = useResource('ops.distributors', () => ops.distributors())
  const [query, setQuery] = useQueryState(['region', 'dist'] as const)

  const region = regions.data?.find((r) => r.id === query.region)
  const dists = (distributors.data ?? []).filter((d) => d.region === region?.id)
  const dist = dists.find((d) => d.id === query.dist)
  const focus = dist ? { at: dist.at, zoom: 10 } : region ? { at: region.at, zoom: region.zoom } : INDONESIA
  const max = Math.max(1, ...(regions.data ?? []).map((r) => r.subsidyQuota))

  return (
    <div className="space-y-4">
      <NewButtons types={['dms.orders', 'dms.quotas']} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-3 xl:col-span-2">
          <nav aria-label="Map level" className="flex flex-wrap items-center gap-1 px-2 pt-1 pb-3 text-sm">
            <button type="button" onClick={() => setQuery({ region: undefined, dist: undefined })} className={cn('cursor-pointer rounded-full px-3 py-1', region ? 'text-muted hover:bg-raised' : 'bg-invert text-on-invert')}>
              Indonesia
            </button>
            {region && (
              <>
                <ChevronRight aria-hidden className="size-4 text-subtle" />
                <button type="button" onClick={() => setQuery({ dist: undefined })} className={cn('cursor-pointer rounded-full px-3 py-1', dist ? 'text-muted hover:bg-raised' : 'bg-invert text-on-invert')}>
                  {region.name}
                </button>
              </>
            )}
            {dist && (
              <>
                <ChevronRight aria-hidden className="size-4 text-subtle" />
                <span className="rounded-full bg-invert px-3 py-1 text-on-invert">{dist.name}</span>
              </>
            )}
          </nav>
          {regions.data && distributors.data ? (
            <BaseMap center={INDONESIA.at} zoom={INDONESIA.zoom} focus={focus} className="h-[460px] xl:h-[600px]" label="Distribution network map">
              {!region &&
                regions.data.map((r) => (
                  <Circle
                    key={r.id}
                    center={[r.at[0], r.at[1]]}
                    radius={40_000 + 90_000 * (r.subsidyQuota / max)}
                    pathOptions={{ className: usage(r.subsidyUsed, r.subsidyQuota) > HOT ? 'mark-region-hot' : 'mark-region', weight: 2 }}
                    eventHandlers={{ click: () => setQuery({ region: r.id }) }}
                  >
                    <Tooltip direction="top">
                      {r.name} · {percent(usage(r.subsidyUsed, r.subsidyQuota), { digits: 0 })} subsidy used
                    </Tooltip>
                  </Circle>
                ))}
              {dists.map((d) => (
                <Marker key={d.id} position={[d.at[0], d.at[1]]} icon={d.id === dist?.id ? DOT.on : DOT.off} eventHandlers={{ click: () => setQuery({ dist: d.id }) }}>
                  <Tooltip direction="top" offset={[0, -10]}>
                    {d.name}
                  </Tooltip>
                </Marker>
              ))}
            </BaseMap>
          ) : (
            <Skeleton className="h-[460px] rounded-panel xl:h-[600px]" />
          )}
        </Card>

        <Card key={`${region?.id}-${dist?.id}`} className="animate-rise">
          {!region && (
            <>
              <h2 className="text-lg font-semibold">Quota by province</h2>
              <p className="mb-4 text-xs text-muted">Click a province on the map or below to see its distributors.</p>
              <ul className="space-y-2">
                {(regions.data ?? []).map((r) => (
                  <li key={r.id} data-motion="row">
                    <button type="button" onClick={() => setQuery({ region: r.id })} className="w-full cursor-pointer rounded-panel bg-raised p-3 text-left hover:bg-control">
                      <span className="mb-2 flex items-center justify-between text-sm font-semibold">
                        {r.name}
                        {usage(r.subsidyUsed, r.subsidyQuota) > HOT && <Tag tone="danger">Near limit</Tag>}
                      </span>
                      <QuotaBars r={r} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {region && !dist && (
            <>
              <p className="text-xs text-muted">Province</p>
              <h2 className="mb-4 text-2xl font-bold tracking-tight">
                {region.name}
                <span className="text-accent">.</span>
              </h2>
              <QuotaBars r={region} />
              <p className="mt-6 mb-2 text-sm font-semibold">Distributors ({dists.length})</p>
              <ul className="divide-y divide-line">
                {dists.map((d) => (
                  <li key={d.id} data-motion="row">
                    <button type="button" onClick={() => setQuery({ dist: d.id })} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left hover:bg-raised">
                      <Store aria-hidden className="size-4 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.name}</span>
                        <span className="block text-xs text-muted">
                          {d.kiosks} kiosks · {count(d.ordersMtd)} t this month
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {dist && (
            <>
              <p className="text-xs text-muted">{region?.name} · distributor</p>
              <h2 className="text-2xl font-bold tracking-tight">
                {dist.name}
                <span className="text-accent">.</span>
              </h2>
              <FactGrid
                className="mt-4 grid-cols-2"
                facts={[
                  ['Kiosks', String(dist.kiosks)],
                  ['Orders this month', `${count(dist.ordersMtd)} t`],
                  ['Stock cover', `${dist.stockDays} days`],
                  ['Area manager', dist.manager],
                ]}
              />
              <p className="mt-5 mb-2 text-sm font-semibold">Kiosks with the most orders</p>
              <ul className="divide-y divide-line">
                {kiosks(dist).map((k) => (
                  <li key={k.id} data-motion="row" className="flex items-center gap-3 py-2.5 text-sm">
                    <span className={cn('size-2 rounded-full', k.open ? 'bg-success' : 'bg-subtle')} />
                    <span className="min-w-0 flex-1 truncate">{k.name}</span>
                    <span className="text-xs text-muted tabular">{k.stock} t on hand</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="solid" size="sm" onClick={() => toast({ title: `Allocation sent to ${dist.name}`, description: 'Demo: the DMS quota change is simulated.' })}>
                  Allocate quota
                </Button>
                <Button variant="soft" size="sm" onClick={() => toast({ title: `Called ${dist.manager}`, description: 'Demo: no phone line is connected.' })}>
                  <Phone aria-hidden className="size-3.5" /> Call manager
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
