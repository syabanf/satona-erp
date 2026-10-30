import { lazy, Suspense, useId, useState } from 'react'
import { Link } from 'react-router'
import { Pencil, ShoppingCart, X } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { tankStatus, type Tank, type TankStatus } from '@/domain/ops'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { LineChart } from '../../charts/LineChart'
import { useQueryState } from '../../hooks/useParams'
import { useRecordList } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { useTicker } from '../../hooks/useTicker'
import { StatusPill, type Tone } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { FactGrid } from '../../ui/Headline'
import { CountUp } from '../../ui/Motion'
import { CardSkeleton, Skeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/useToast'
import { recordPath } from '../../records/text'

const TankFarm3D = lazy(() => import('../../three/TankFarm3D'))
const VIEWS = [
  { value: '2d', label: 'Gauges' },
  { value: '3d', label: '3D farm' },
] as const

const STATUS: Record<TankStatus, { label: string; tone: Tone }> = {
  ok: { label: 'Normal', tone: 'success' },
  reorder: { label: 'Reorder', tone: 'danger' },
  high: { label: 'Near full', tone: 'warning' },
}

/** Live dip reading: the stored level plus a small gauge wobble. */
const reading = (t: Tank, elapsed: number, i: number) => Math.round((t.level + 0.6 * Math.sin(elapsed / 1.5 + i)) * 10) / 10

/** A tank drawn in SVG: liquid rises to the level, a wave runs across the surface, a dashed line marks the reorder point. */
function TankGraphic({ level, reorderAt, status }: { level: number; reorderAt: number; status: TankStatus }) {
  const y = 112 - level
  const clip = useId()
  const fill = status === 'reorder' ? 'var(--color-accent)' : 'var(--color-info)'
  return (
    <svg viewBox="0 0 80 120" className="h-36 w-24" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x="6" y="8" width="68" height="104" rx="14" />
        </clipPath>
      </defs>
      <rect x="6" y="8" width="68" height="104" rx="14" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="2" />
      <g clipPath={`url(#${clip})`}>
        <g style={{ transform: `translateY(${y}px)`, transition: 'transform 1.2s cubic-bezier(.2,.8,.2,1)' }}>
          <path d="M-80 4 Q-60 0 -40 4 T0 4 T40 4 T80 4 T120 4 T160 4 V200 H-80 Z" fill={fill} opacity="0.85">
            <animateTransform attributeName="transform" type="translate" from="0 0" to="80 0" dur="3s" repeatCount="indefinite" />
          </path>
        </g>
      </g>
      <line x1="2" x2="78" y1={112 - reorderAt} y2={112 - reorderAt} stroke="var(--color-fg)" strokeDasharray="4 3" strokeWidth="1.5" />
    </svg>
  )
}

export default function TankFarmPage() {
  const { ops, records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const tanks = useResource('ops.tanks', () => ops.tanks())
  const recs = useRecordList('tfm.tanks')
  const materials = useRecordList('mdm.materials')
  const [query, setQuery] = useQueryState(['tank', 'view'] as const)
  const [busy, setBusy] = useState(false)
  const elapsed = useTicker(4)

  if (!tanks.data || !recs.data) return <CardSkeleton lines={6} />
  // Telemetry comes from the gauges; product, levels and reorder points come from the TFM records, so edits there show here.
  const tankRecords = recs.data
  const all = tanks.data.map((t) => {
    const r = tankRecords.find((x) => String(x.values.tank).toLowerCase() === t.id)
    return r
      ? { ...t, product: String(r.values.product), capacity: Number(r.values.capacity), level: Number(r.values.level), reorderAt: Number(r.values.reorderAt), supplier: String(r.values.supplier ?? t.supplier), record: r.id }
      : { ...t, record: undefined }
  })
  const tankType = typeOf('tfm.tanks')

  async function raiseRequest(t: (typeof all)[number]) {
    setBusy(true)
    try {
      const material = materials.data?.find((m) => t.product.toLowerCase().startsWith(String(m.values.name).toLowerCase().split(' ')[0] ?? '')) ?? materials.data?.[0]
      const need = Math.round((t.capacity * (90 - t.level)) / 100)
      const pr = await records.create(role, 'vms.requisitions', {
        title: `Refill ${t.id.toUpperCase()} ${t.product}`,
        material: material?.id,
        qty: Math.max(1, need),
        entity: 'roasi',
        value: need * 9_500_000,
        needBy: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      })
      toast({ title: `Purchase requisition ${pr.id} raised`, description: 'It now waits in Group Procurement (VMS) approvals.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not raised', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const picked = all.find((t) => t.id === query.tank)
  const stock = all.reduce((s, t) => s + (t.capacity * t.level) / 100, 0)
  const low = all.filter((t) => tankStatus(t) === 'reorder').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Stock on hand', value: stock, fmt: (v: number) => `${count(Math.round(v))} m³` },
          { label: 'Tanks online', value: all.length, fmt: (v: number) => `${Math.round(v)} of ${all.length}` },
          { label: 'Under reorder point', value: low, fmt: (v: number) => String(Math.round(v)) },
          { label: 'Stock variance vs book', value: 0.4, fmt: (v: number) => `${v.toFixed(1)}%` },
        ].map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-2 text-[28px] font-medium tracking-tight tabular">
              <CountUp value={k.value} format={k.fmt} />
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={cn(picked ? 'xl:col-span-2' : 'xl:col-span-3')}>
          <CardHeader
            title="Roasi tank farm, Merak"
            action={<Tabs label="View" options={VIEWS} value={query.view === '3d' ? '3d' : '2d'} onChange={(v) => setQuery({ view: v === '3d' ? v : undefined })} />}
          />
          {query.view === '3d' ? (
            <Suspense fallback={<Skeleton className="h-[460px] rounded-panel" />}>
              <TankFarm3D tanks={all.map((t, i) => ({ id: t.id, product: t.product, level: reading(t, elapsed, i), reorderAt: t.reorderAt }))} selected={picked?.id} onSelect={(id) => setQuery({ tank: id === query.tank ? undefined : id })} />
            </Suspense>
          ) : (
          <ul className={cn('grid gap-3 sm:grid-cols-2', picked ? 'lg:grid-cols-3' : 'lg:grid-cols-3 2xl:grid-cols-6')}>
            {all.map((t, i) => {
              const level = reading(t, elapsed, i)
              const status = tankStatus(t)
              const on = t.id === picked?.id
              return (
                <li key={t.id} data-motion="row">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setQuery({ tank: on ? undefined : t.id })}
                    className={cn(
                      'flex w-full cursor-pointer flex-col items-center rounded-panel p-4 text-center transition-[background-color,translate] duration-300 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1',
                      on ? 'bg-invert text-on-invert' : 'bg-raised hover:bg-control',
                    )}
                  >
                    <span className="font-mono text-xs font-semibold">{t.id.toUpperCase()}</span>
                    <TankGraphic level={level} reorderAt={t.reorderAt} status={status} />
                    <span className="text-2xl font-semibold tabular">{level.toFixed(1)}%</span>
                    <span className={cn('mt-0.5 line-clamp-1 text-xs', on ? 'opacity-70' : 'text-muted')}>{t.product}</span>
                    <StatusPill tone={STATUS[status].tone} className="mt-2">
                      {STATUS[status].label}
                    </StatusPill>
                  </button>
                </li>
              )
            })}
          </ul>
          )}
          <p className="mt-3 text-xs text-muted">The dashed line marks each tank's reorder point. Click a tank for its 24-hour trend.</p>
        </Card>

        {picked && (
          <Card key={picked.id} className="animate-rise">
            <div className="mb-3 flex items-center justify-between">
              <StatusPill tone={STATUS[tankStatus(picked)].tone}>{STATUS[tankStatus(picked)].label}</StatusPill>
              <Button variant="ghost" size="icon-sm" aria-label="Close tank detail" onClick={() => setQuery({ tank: undefined })}>
                <X aria-hidden className="size-4" />
              </Button>
            </div>
            <p className="font-mono text-xs text-muted">{picked.id.toUpperCase()}</p>
            <h2 className="text-2xl font-bold tracking-tight">
              {picked.product}
              <span className="text-accent">.</span>
            </h2>
            <p className="mt-4 mb-2 text-sm font-semibold">Level, last 24 hours</p>
            <LineChart
              labels={picked.trend.map((_, i) => `${String(i).padStart(2, '0')}:00`)}
              series={[
                { id: 'level', label: 'Level', values: picked.trend, color: 'var(--color-series-2)', area: true },
                { id: 'reorder', label: 'Reorder point', values: picked.trend.map(() => picked.reorderAt), color: 'var(--color-series-1)', muted: true },
              ]}
              format={(v) => `${v}%`}
              max={100}
              height={180}
              label={`${picked.product} level trend`}
            />
            <FactGrid
              className="mt-4 grid-cols-2"
              facts={[
                ['Capacity', `${count(picked.capacity)} m³`],
                ['On hand', `${count(Math.round((picked.capacity * picked.level) / 100))} m³`],
                ['Temperature', `${picked.temp} °C`],
                ['Pressure', `${picked.pressure} bar`],
                ['Reorder at', `${picked.reorderAt}%`],
                ['Supplier', picked.supplier],
              ]}
            />
            {tankStatus(picked) === 'reorder' ? (
              <Button variant="accent" className="mt-4 w-full" loading={busy} onClick={() => raiseRequest(picked)}>
                <ShoppingCart aria-hidden className="size-4" /> Raise purchase request
              </Button>
            ) : (
              <p className="mt-4 rounded-panel bg-raised p-3 text-xs text-muted">Above the reorder point. The auto-reorder trigger fires when the dip reading crosses {picked.reorderAt}%.</p>
            )}
            {picked.record && tankType && (
              <Link to={`${recordPath(tankType, picked.record)}/edit`} className={buttonStyles({ variant: 'soft', size: 'sm', className: 'mt-3' })}>
                <Pencil aria-hidden className="size-3.5" /> Edit level and reorder point in TFM
              </Link>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
