import { Link, useNavigate } from 'react-router'
import { typeOf } from '@/domain/catalog'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { count, percent } from '@/lib/format'
import { LineChart } from '../../charts/LineChart'
import { useQueryState } from '../../hooks/useParams'
import { useRecordsVersion } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { FactGrid } from '../../ui/Headline'
import { CountUp } from '../../ui/Motion'
import { CardSkeleton } from '../../ui/States'
import { recordPath } from '../../records/text'

interface Box {
  id: string
  label: string
  sub: string
  x: number
  y: number
  w: number
  h: number
  /** Integration components select in place; the rest open their page. */
  to?: string
}

const BOXES: readonly Box[] = [
  { id: 'erp-holding', label: 'Satona Holding', sub: 'MDM · EPM · VMS · GRC', x: 20, y: 30, w: 190, h: 56, to: '/entities/holding' },
  { id: 'erp-rotama', label: 'Rotama ERP', sub: 'TMS · WMS · billing', x: 20, y: 110, w: 190, h: 56, to: '/entities/rotama' },
  { id: 'erp-rodame', label: 'Rodame ERP', sub: 'Batch · MRP · QC · DMS', x: 20, y: 190, w: 190, h: 56, to: '/entities/rodame' },
  { id: 'erp-roasi', label: 'Roasi ERP', sub: 'CFP · EHS · tank farm', x: 20, y: 270, w: 190, h: 56, to: '/entities/roasi' },
  { id: 'kafka', label: 'Kafka / RabbitMQ', sub: 'Event bus', x: 300, y: 70, w: 190, h: 60 },
  { id: 'debezium', label: 'Debezium CDC', sub: 'PostgreSQL change capture', x: 300, y: 230, w: 190, h: 60 },
  { id: 'kong', label: 'Kong API Gateway', sub: 'Rate limits · API docs', x: 560, y: 70, w: 190, h: 60 },
  { id: 'clickhouse', label: 'ClickHouse', sub: 'Data warehouse', x: 560, y: 230, w: 190, h: 60 },
  { id: 'apps', label: 'Portals & apps', sub: 'Vendor · Driver · Distributor', x: 800, y: 70, w: 180, h: 60, to: '/users?kind=external' },
  { id: 'bi', label: 'Executive BI', sub: 'Dashboards · models', x: 800, y: 230, w: 180, h: 60, to: '/' },
  { id: 'keycloak', label: 'Keycloak IAM', sub: 'SSO / OIDC · RBAC & ABAC for every app above', x: 300, y: 350, w: 680, h: 50 },
]

const EDGES: ReadonlyArray<readonly [string, string, number]> = [
  ['erp-holding', 'kafka', 2.4],
  ['erp-rotama', 'kafka', 1.6],
  ['erp-rodame', 'kafka', 1.8],
  ['erp-roasi', 'kafka', 2.0],
  ['erp-holding', 'debezium', 3.0],
  ['erp-rotama', 'debezium', 2.6],
  ['erp-rodame', 'debezium', 2.2],
  ['erp-roasi', 'debezium', 2.8],
  ['kafka', 'kong', 1.4],
  ['kong', 'apps', 1.2],
  ['debezium', 'clickhouse', 1.6],
  ['clickhouse', 'bi', 2.0],
]

const box = (id: string) => BOXES.find((b) => b.id === id) as Box
function edgePath(from: string, to: string) {
  const a = box(from)
  const b = box(to)
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mid = (x1 + x2) / 2
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`
}

export default function IntegrationPage() {
  const { ops, records } = useServices()
  const navigate = useNavigate()
  const parts = useResource('ops.integration', () => ops.integration())
  const [query, setQuery] = useQueryState(['c'] as const)
  const version = useRecordsVersion()
  const events = useResource(`records.events:${version}`, () => records.events())

  if (!parts.data) return <CardSkeleton lines={8} />
  const picked = parts.data.find((p) => p.id === query.c)
  const near = (id: string) => !picked || picked.id === 'keycloak' || id === picked.id || EDGES.some(([a, b]) => (a === picked.id && b === id) || (b === picked.id && a === id))

  function open(b: Box) {
    if (b.to) navigate(b.to)
    else setQuery({ c: query.c === b.id ? undefined : b.id })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {parts.data.map((p) => {
          const last = p.throughput[p.throughput.length - 1] ?? 0
          const on = p.id === query.c
          return (
            <button
              key={p.id}
              type="button"
              data-motion="rise"
              aria-pressed={on}
              onClick={() => setQuery({ c: on ? undefined : p.id })}
              className={cn(
                'cursor-pointer rounded-card border p-4 text-left shadow-card transition-[color,background-color,translate,scale] duration-300 active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1',
                on ? 'border-transparent bg-invert text-on-invert' : 'border-line bg-card',
              )}
            >
              <p className={cn('truncate text-xs', on ? 'opacity-70' : 'text-muted')}>{p.role}</p>
              <p className="mt-1 text-xl font-medium tracking-tight tabular">
                <CountUp value={last} format={(v) => count(Math.round(v))} />
                <span className={cn('ml-1 text-xs', on ? 'opacity-70' : 'text-muted')}>{p.unit}</span>
              </p>
              <p className="mt-1 truncate text-xs font-medium">{p.name}</p>
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={picked ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <CardHeader title="Data flow across the group" icon={<Activity aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">Click a component to trace its links</span>} />
          <p className="mb-2 text-xs text-muted md:hidden">Swipe sideways to explore the full data flow.</p>
          <div className="overflow-x-auto">
            <svg viewBox="0 0 1000 410" className="min-w-[720px]" role="group" aria-label="Integration architecture">
              {EDGES.map(([a, b, dur]) => {
                const d = edgePath(a, b)
                const on = !picked || a === picked.id || b === picked.id
                return (
                  <g key={`${a}-${b}`} className={cn('transition-opacity duration-300', on ? 'opacity-100' : 'opacity-15')}>
                    <path d={d} fill="none" strokeWidth={2} className={picked && on ? 'stroke-accent' : 'stroke-line-strong'} />
                    <circle r={4} className={picked && on ? 'fill-accent' : 'fill-fg'}>
                      <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  </g>
                )
              })}
              {BOXES.filter((b) => b.id !== 'keycloak').map((b) => (
                <line key={`sso-${b.id}`} x1={b.x + b.w / 2} y1={b.y + b.h} x2={b.x + b.w / 2} y2={350} strokeDasharray="3 5" className={cn('stroke-info transition-opacity', query.c === 'keycloak' ? 'opacity-100' : 'opacity-0')} strokeWidth={1.5} />
              ))}
              {BOXES.map((b) => {
                const on = query.c === b.id
                const external = Boolean(b.to)
                return (
                  <g
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${b.label}, ${b.sub}`}
                    onClick={() => open(b)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(b))}
                    className={cn('cursor-pointer outline-none transition-opacity duration-300 [&:focus-visible>rect]:stroke-accent', !near(b.id) && b.id !== 'keycloak' && 'opacity-30')}
                  >
                    <rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={16}
                      strokeWidth={2}
                      className={cn(
                        'transition-colors duration-300',
                        on ? 'fill-invert stroke-invert' : b.id === 'keycloak' ? 'fill-info-soft stroke-info' : external ? 'fill-card stroke-line-strong hover:fill-raised' : 'fill-raised stroke-line-strong hover:fill-control',
                      )}
                    />
                    <text x={b.x + 16} y={b.y + 25} className={cn('text-[14px] font-semibold', on ? 'fill-on-invert' : b.id === 'keycloak' ? 'fill-info-text' : 'fill-fg')}>
                      {b.label}
                    </text>
                    <text x={b.x + 16} y={b.y + 43} className={cn('text-[11px]', on ? 'fill-on-invert/70' : 'fill-muted')}>
                      {b.sub}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </Card>

        {picked && (
          <Card key={picked.id} className="animate-rise">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-xs text-muted">{picked.role}</p>
              <Button variant="ghost" size="icon-sm" aria-label="Close component detail" onClick={() => setQuery({ c: undefined })}>
                <X aria-hidden className="size-4" />
              </Button>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {picked.name}
              <span className="text-accent">.</span>
            </h2>
            <p className="mt-2 text-sm text-body">{picked.scope}</p>
            <p className="mt-5 mb-2 text-sm font-semibold">Throughput, last 12 minutes</p>
            <LineChart
              labels={picked.throughput.map((_, i) => `-${11 - i}m`)}
              series={[{ id: picked.id, label: picked.unit, values: picked.throughput, color: 'var(--color-series-2)', area: true }]}
              format={(v) => `${count(v)} ${picked.unit}`}
              height={160}
              onPick={() => navigate(`/modules/occ/sources?q=${encodeURIComponent(picked.name)}`)}
              label={`${picked.name} throughput`}
            />
            <FactGrid
              className="mt-4 grid-cols-2"
              facts={[
                ['Uptime, 30 days', percent(picked.uptime, { digits: 2 })],
                ['Managed by', picked.team],
                ['Main users', picked.users],
              ]}
            />
          </Card>
        )}
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative size-2.5 rounded-full bg-accent" />
            </span>
            Event bus, live
          </h2>
          <span className="text-xs text-muted">Every create, edit, step and delete in the ERP publishes here</span>
        </div>
        {(events.data ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">
            No events yet. Create or approve a record in any module and it appears here, topic by topic.{' '}
            <Link to="/modules/tms/trips/new" className="font-semibold text-fg underline">
              Plan a trip
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {(events.data ?? []).slice(0, 15).map((e) => {
              const t = typeOf(e.topic)
              return (
                <li key={e.id} className="animate-rise">
                  <Link to={t && e.action !== 'Deleted' ? recordPath(t, e.recordId) : '#'} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-raised">
                    <span className="w-40 shrink-0 font-mono text-xs text-muted">{e.topic}</span>
                    <span className="font-mono text-xs font-semibold">{e.recordId}</span>
                    <span className="min-w-0 flex-1 truncate">{e.action}</span>
                    <span className="text-xs text-muted">
                      {e.by} · {new Date(e.at).toLocaleTimeString('en-GB')}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
