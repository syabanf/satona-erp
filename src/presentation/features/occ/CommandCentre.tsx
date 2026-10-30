import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { divIcon } from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'
import { Radio, Siren } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { perDay } from '@/domain/kpi'
import { allowedTransitions, type ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { LineChart } from '../../charts/LineChart'
import { BaseMap } from '../../maps/BaseMap'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { StateBadge } from '../../records/StateBadge'
import { recordPath, refTitle } from '../../records/text'
import { KpiTile } from '../mes/KpiTile'

const RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const OPEN = new Set(['new', 'acknowledged', 'assigned'])
const PRIORITY_DOT: Record<string, string> = { Critical: 'bg-accent', High: 'bg-warning', Medium: 'bg-info', Low: 'bg-subtle' }

const pin = (n: number, worst?: string) =>
  divIcon({
    className: '',
    iconSize: [30, 30],
    html: `<span class="relative grid size-[30px] place-items-center rounded-full ${worst === 'Critical' ? 'bg-accent text-white' : n ? 'bg-warning text-white' : 'bg-success text-white'} text-[11px] font-bold ring-2 ring-card shadow-float">${worst === 'Critical' ? '<span class="absolute inset-0 rounded-full border-2 border-accent animate-ping-ring"></span>' : ''}${n}</span>`,
  })

/** Group operations command centre, ported from the WIT GPI Command Center onto Satona's plants, depots and fleet. */
export default function CommandCentre() {
  const { ops, records, clock } = useServices()
  const today = clock.today()
  const { role } = useSession()
  const toast = useToast()
  const accessFor = useAccess()
  const all = useAllRecords()
  const sites = useResource('ops.sites', () => ops.sites())
  const [site, setSite] = useState<string>()
  const [busy, setBusy] = useState<string | null>(null)

  const d = useMemo(() => {
    if (!all.data) return null
    const plants = all.data['mdm.plants'] ?? []
    const units = all.data['occ.units'] ?? []
    const siteOf = (unitId: string) => String(units.find((u) => u.id === unitId)?.values.site ?? '')
    const open = (all.data['occ.alarms'] ?? []).filter((a) => OPEN.has(a.status)).sort((a, b) => (RANK[String(a.values.priority)] ?? 9) - (RANK[String(b.values.priority)] ?? 9) || b.createdAt.localeCompare(a.createdAt))
    const sources = all.data['occ.sources'] ?? []
    const energy = (all.data['occ.energy'] ?? []).slice(0, 30)
    return {
      plants,
      units,
      siteOf,
      open,
      sources,
      escalation: all.data['occ.escalation'] ?? [],
      intensity: energy.reduce((s, r) => s + Number(r.values.power ?? 0), 0) * 1000 / Math.max(1, energy.reduce((s, r) => s + Number(r.values.output ?? 0), 0)),
    }
  }, [all.data])

  if (!d || !all.data) return <CardSkeleton lines={8} />
  const alarmType = typeOf('occ.alarms')!
  const unitType = typeOf('occ.units')!
  const sourceType = typeOf('occ.sources')!
  const access = accessFor('occ')
  const feed = d.open.filter((a) => !site || d.siteOf(String(a.values.unit)) === site)
  const critical = d.open.filter((a) => a.values.priority === 'Critical').length
  const connected = d.sources.filter((s) => s.status === 'connected').length

  async function step(a: ErpRecord, to: string, label: string) {
    setBusy(a.id)
    try {
      await records.transition(role, 'occ.alarms', a.id, to)
      toast({ title: `${a.id} moved to ${alarmType.workflow.states.find((st) => st.id === to)?.label ?? to}`, description: label })
    } catch (e) {
      toast({ tone: 'danger', title: 'Not changed', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiTile label="Open alarms" value={d.open.length} format={(v) => String(Math.round(v))} to={`${recordPath(alarmType)}?status=new`} accent />
        <KpiTile label="Critical" value={critical} format={(v) => String(Math.round(v))} to={`${recordPath(alarmType)}?f=Critical`} />
        <KpiTile label="Units tripped" value={d.units.filter((u) => u.status === 'tripped').length} format={(v) => String(Math.round(v))} to={`${recordPath(unitType)}?status=tripped`} note={`of ${d.units.length} monitored`} />
        <KpiTile label="Data sources online" value={connected} format={(v) => `${Math.round(v)} / ${d.sources.length}`} to={recordPath(sourceType)} />
        <KpiTile label="Energy intensity" value={d.intensity} format={(v) => `${Math.round(v)} kWh/t`} to={recordPath(typeOf('occ.energy')!)} note="last 30 readings" />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="p-3 xl:col-span-3">
          {sites.data ? (
            <BaseMap center={[-5.6, 109.5]} zoom={6} focus={site ? { at: sites.data.find((s) => s.name === d.plants.find((p) => p.id === site)?.values.name)?.at ?? [-5.6, 109.5], zoom: 9 } : { at: [-5.6, 109.5], zoom: 6 }} className="h-[420px]" label="Sites by open alarms">
              {d.plants.map((p) => {
                const at = sites.data?.find((s) => s.name === p.values.name)?.at
                if (!at) return null
                const mine = d.open.filter((a) => d.siteOf(String(a.values.unit)) === p.id)
                const worst = mine[0]?.values.priority as string | undefined
                return (
                  <Marker key={p.id} position={[at[0], at[1]]} icon={pin(mine.length, worst)} eventHandlers={{ click: () => setSite(site === p.id ? undefined : p.id) }}>
                    <Tooltip direction="top" offset={[0, -14]}>
                      {String(p.values.name)} · {mine.length} open
                    </Tooltip>
                  </Marker>
                )
              })}
            </BaseMap>
          ) : null}
          <p className="px-2 pt-2 text-xs text-muted">Pins show open alarms per site; click one to filter the feed.</p>
        </Card>

        <Card className="p-0 xl:col-span-2">
          <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Siren aria-hidden className="size-5 text-accent" /> Alarm feed
            </h2>
            {site ? (
              <button type="button" onClick={() => setSite(undefined)} className="cursor-pointer text-xs font-medium text-accent-text hover:underline">
                {refTitle('mdm.plants', site, all.data).split(' · ')[0]} · show all
              </button>
            ) : (
              <span className="text-xs text-muted tabular">{feed.length} open</span>
            )}
          </div>
          <ul className="max-h-[400px] divide-y divide-line overflow-y-auto">
            {feed.map((a) => {
              const next = allowedTransitions(alarmType, a.status, access)[0]
              return (
                <li key={a.id} data-motion="row" className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', PRIORITY_DOT[String(a.values.priority)])} />
                  <Link to={recordPath(alarmType, a.id)} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium">{String(a.values.message)}</span>
                    <span className="block truncate text-xs text-muted">
                      {refTitle('occ.units', String(a.values.unit), all.data).split(' · ')[0]} · {String(a.values.priority)} · {String(a.values.escalation ?? '')}
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StateBadge type={alarmType} status={a.status} />
                    {next && (
                      <Button size="sm" variant="solid" loading={busy === a.id} onClick={() => step(a, next.to, next.label)}>
                        {next.label}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
            {feed.length === 0 && <li className="px-5 py-6 text-sm text-muted">No open alarm here.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Alarms raised per day, 14 days" />
        <LineChart
          labels={perDay([], today, 14, () => '').map((x) => x.day.slice(8))}
          series={(['Critical', 'High', 'Medium', 'Low'] as const).map((p, i) => ({
            id: p,
            label: p,
            values: perDay((all.data?.['occ.alarms'] ?? []).filter((a) => a.values.priority === p), today, 14, (a) => String(a.values.raised)).map((x) => x.count),
            color: ['var(--color-series-1)', 'var(--color-series-3)', 'var(--color-series-2)', 'var(--color-series-other)'][i] ?? '',
            area: i === 0,
          }))}
          format={(v) => `${v} alarms`}
          height={200}
          label="Alarms raised per day by priority"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Unit status" action={<Link to={recordPath(unitType)} className="text-xs font-medium text-accent-text hover:underline">All units</Link>} />
          <ul className="grid grid-cols-2 gap-2">
            {d.units.map((u) => (
              <li key={u.id}>
                <Link to={recordPath(unitType, u.id)} className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-xs hover:bg-control">
                  <span className={cn('size-2 shrink-0 rounded-full', u.status === 'running' ? 'bg-success' : u.status === 'tripped' ? 'bg-accent' : u.status === 'maintenance' ? 'bg-warning' : 'bg-info')} />
                  <span className="min-w-0 flex-1 truncate font-medium">{String(u.values.tag)}</span>
                  <span className="text-muted tabular">{String(u.values.load ?? '')}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Data-source health" icon={<Radio aria-hidden className="size-5 text-muted" />} />
          <ul className="divide-y divide-line">
            {d.sources.map((s) => (
              <li key={s.id} data-motion="row">
                <Link to={recordPath(sourceType, s.id)} className="flex items-center gap-3 py-2 text-sm hover:underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{String(s.values.name)}</span>
                    <span className="block truncate text-xs text-muted">
                      {String(s.values.kind)} · {String(s.values.protocol)}
                    </span>
                  </span>
                  <StateBadge type={sourceType} status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Escalation matrix" action={<Link to={recordPath(typeOf('occ.escalation')!)} className="text-xs font-medium text-accent-text hover:underline">Maintain</Link>} />
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-medium">Priority</th>
                <th className="py-1.5 font-medium">Level</th>
                <th className="py-1.5 font-medium">Notify</th>
                <th className="py-1.5 text-right font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.escalation.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('size-2 rounded-full', PRIORITY_DOT[String(e.values.priority)])} />
                      {String(e.values.priority)}
                    </span>
                  </td>
                  <td className="py-1.5 text-muted">{String(e.values.level).split(' · ')[0]}</td>
                  <td className="py-1.5">
                    {String(e.values.role)} · {String(e.values.channel)}
                  </td>
                  <td className="py-1.5 text-right tabular">{count(Number(e.values.within))} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
