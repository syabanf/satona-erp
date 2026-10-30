import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, ArrowUpRight, MapPin, UsersRound } from 'lucide-react'
import { moduleProgress, moduleStatus, SCOPE_LABEL, type EntityId } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { count, moneyCompact, percent } from '@/lib/format'
import { seriesColor } from '../../charts/colors'
import { LineChart } from '../../charts/LineChart'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { BaseMap } from '../../maps/BaseMap'
import { SiteMarkers } from '../../maps/SiteMarkers'
import { Delta, StatusPill } from '../../ui/Badge'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { Fallback } from '../../ui/Gate'
import { Meter } from '../../ui/Meter'
import { CountUp } from '../../ui/Motion'
import { POP } from '../../ui/pop'
import { ENTITY_ICON, ENTITY_POP, monthLabels, SCOPE_TONE } from '../entityStyle'

const lift =
  'transition-[color,background-color,translate,scale] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1'

export default function EntityPage() {
  const { id = '' } = useParams()
  const { erp, ops, clock } = useServices()
  const entity = useResource(`erp.entity:${id}`, () => erp.entity(id as EntityId), { keepPrevious: false })
  const modules = useResource('erp.modules', () => erp.modules())
  const roles = useResource('erp.roles', () => erp.roles())
  const sites = useResource('ops.sites', () => ops.sites())
  const entities = useResource('erp.entities', () => erp.entities())
  const [site, setSite] = useState<string>()

  const e = entity.data
  if (!e) return <Fallback error={entity.error} onRetry={entity.reload} back={{ to: '/', label: 'Back to the overview' }} what="entity" />

  const Icon = ENTITY_ICON[e.id]
  const mods = (modules.data ?? []).filter((m) => m.entity === e.id)
  const mySites = (sites.data ?? []).filter((s) => s.entity === e.id)
  const myRoles = (roles.data ?? []).filter((r) => r.entity === e.id)
  const picked = mySites.find((s) => s.id === site)
  const first = mySites[0]
  const labels = monthLabels(clock.today())

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section data-motion="rise" className={cn('rounded-card p-6 shadow-pop', POP[ENTITY_POP[e.id]])}>
          <Icon aria-hidden className="size-8" />
          <p className="mt-8 text-sm opacity-70">{e.sector}</p>
          <h2 className="text-2xl font-bold tracking-tight">
            {e.name}
            <span className={e.id === 'roasi' ? 'text-white' : 'text-accent'}>.</span>
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs opacity-70">Revenue YTD</p>
              <p className="text-[28px] font-medium tracking-tight tabular">
                <CountUp value={e.revenueYtd} format={moneyCompact} />
              </p>
            </div>
            <div>
              <p className="text-xs opacity-70">Headcount</p>
              <p className="text-[28px] font-medium tracking-tight tabular">
                <CountUp value={e.headcount} format={count} />
              </p>
            </div>
          </div>
          <Link to={`/users?entity=${e.id}`} className={buttonStyles({ variant: e.id === 'roasi' || e.id === 'holding' ? 'onPop' : 'ink', size: 'sm', className: 'mt-5' })}>
            <UsersRound aria-hidden className="size-3.5" /> {myRoles.length} system roles
          </Link>
        </section>

        <Card className="lg:col-span-2">
          <CardHeader title="Monthly revenue" action={<span className="text-xs text-muted">Rp miliar</span>} />
          <LineChart
            labels={labels}
            series={[{ id: e.id, label: e.short, values: e.revenue.map((v) => Math.round(v / 1e8) / 10), color: seriesColor(e.slot), area: true }]}
            format={(v) => `Rp ${v.toFixed(1)} M`}
            height={230}
            label={`${e.short} monthly revenue`}
          />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {e.kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-2 text-[28px] font-medium tracking-tight tabular">
              <CountUp value={k.value} format={(v) => (k.unit === '%' ? `${v.toFixed(1)}%` : k.unit === 'Rp' ? `Rp ${count(Math.round(v))}` : count(Math.round(v)))} />
              {k.unit !== '%' && k.unit !== 'Rp' && <span className="ml-1 text-sm text-muted">{k.unit}</span>}
            </p>
            <Delta value={k.delta} goodWhenUp={!/loss|cost|risk|emission|elimination/i.test(k.label)} className="mt-2" />
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="ERP modules" action={<Link to={`/modules?entity=${e.id}`} className={buttonStyles({ variant: 'soft', size: 'sm' })}>Open in catalogue</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mods.map((m) => {
            const status = moduleStatus(m)
            const progress = moduleProgress(m)
            return (
              <Link key={m.id} to={`/modules/${m.id}`} data-motion="row" className={cn('group block rounded-panel bg-raised p-4 hover:bg-control', lift)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{m.code}</span>
                  <StatusPill tone={SCOPE_TONE[status]}>{SCOPE_LABEL[status]}</StatusPill>
                </div>
                <p className="mt-2 min-h-10 text-sm font-semibold">{m.name}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Meter value={progress} tone={status === 'live' ? 'success' : 'fg'} className="flex-1" label={`${m.name} progress`} />
                  <span className="text-xs font-medium tabular">{percent(progress, { digits: 0 })}</span>
                </div>
                <p className="mt-3 flex items-center justify-between text-xs text-muted">
                  {m.scope.length} scope items · {m.users.length} user roles
                  <ArrowUpRight aria-hidden className="size-4 text-subtle group-hover:text-fg" />
                </p>
              </Link>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sites" icon={<MapPin aria-hidden className="size-5 text-muted" />} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {first && entities.data && (
              <BaseMap
                center={first.at}
                zoom={6}
                focus={picked ? { at: picked.at, zoom: 10 } : undefined}
                className="h-80"
                label={`Map of ${e.short} sites`}
              >
                <SiteMarkers sites={mySites} entities={entities.data} selected={site} onSelect={setSite} />
              </BaseMap>
            )}
          </div>
          <ul className="space-y-2">
            {mySites.map((s) => (
              <li key={s.id} data-motion="row">
                <button
                  type="button"
                  aria-pressed={site === s.id}
                  onClick={() => setSite(site === s.id ? undefined : s.id)}
                  className={cn(
                    'w-full cursor-pointer rounded-panel p-3 text-left transition-colors',
                    site === s.id ? 'bg-invert text-on-invert' : 'bg-raised hover:bg-control',
                  )}
                >
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className={cn('text-xs', site === s.id ? 'opacity-70' : 'text-muted')}>
                    {s.city} · {count(s.staff)} staff · {percent(s.utilisation, { digits: 0 })} utilised
                  </p>
                </button>
              </li>
            ))}
            {e.id === 'rotama' && (
              <li>
                <Link to="/fleet" className={buttonStyles({ variant: 'solid', size: 'sm', className: 'mt-1' })}>
                  Live fleet map <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </li>
            )}
          </ul>
        </div>
      </Card>
    </div>
  )
}
