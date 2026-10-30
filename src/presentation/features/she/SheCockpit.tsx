import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowUpRight, FlaskConical, ShieldAlert } from 'lucide-react'
import { approvalChain, matrixOf, pendingStep } from '@/domain/approval'
import { typeOf } from '@/domain/catalog'
import { INCIDENT_KINDS } from '@/domain/catalog/she'
import { dueWithin, perMonth, safetyPyramid, safetyRates } from '@/domain/kpi'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count, monthLabel } from '@/lib/format'
import { Donut } from '../../charts/Donut'
import { LineChart } from '../../charts/LineChart'
import { TONE_COLOR, recordPath, refTitle } from '../../records/text'
import { StateBadge } from '../../records/StateBadge'
import { useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { BarList } from '../../ui/BarList'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { KpiTile } from '../mes/KpiTile'

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'permits', label: 'Permit board' },
  { value: 'health', label: 'Health & environment' },
] as const
type View = (typeof VIEWS)[number]['value']

const BOARD = ['requested', 'approved', 'active', 'suspended'] as const
const PYRAMID_TONE = ['bg-ink text-on-ink', 'bg-accent-strong text-white', 'bg-accent text-white', 'bg-warning-soft text-warning', 'bg-info-soft text-info-text', 'bg-raised', 'bg-raised', 'bg-control']
const t = (key: string) => typeOf(key)!

/** Group SHE / K3 cockpit: lagging and leading indicators, the permit board, health and environment. */
export default function SheCockpit() {
  const { clock, erp } = useServices()
  const all = useAllRecords()
  const entities = useResource('erp.entities', () => erp.entities())
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.find((v) => v.value === params.get('view'))?.value ?? 'overview') as View
  const today = clock.today()

  const k = useMemo(() => {
    if (!all.data || !entities.data) return null
    const d = all.data
    const incidents = d['she.incidents'] ?? []
    const observations = d['she.observations'] ?? []
    // Exposure hours: every employee at 8 h a day, five days a week, over the 180 days the register covers.
    const manHours = entities.data.reduce((s, e) => s + e.headcount, 0) * 8 * Math.round((180 * 5) / 7)
    const permits = d['she.permits'] ?? []
    const byArea = (rows: readonly ErpRecord[], area: string) => rows.filter((r) => r.values.area === area)
    return {
      rates: safetyRates(incidents, manHours, today),
      manHours,
      pyramid: safetyPyramid(incidents, observations, INCIDENT_KINDS),
      trend: {
        incidents: perMonth(incidents.filter((r) => r.values.kind !== 'Near miss'), today, 6, (r) => String(r.values.date)),
        nearMiss: perMonth(incidents.filter((r) => r.values.kind === 'Near miss'), today, 6, (r) => String(r.values.date)),
        observations: perMonth(observations, today, 6, (r) => String(r.values.date)),
      },
      permits,
      activePermits: permits.filter((p) => p.status === 'active').length,
      capaOverdue: (d['she.capa'] ?? []).filter((c) => c.status !== 'verified' && String(c.values.due) < today),
      licences: dueWithin(d['she.licences'] ?? [], 'expiry', today, 60),
      categories: Object.entries(observations.filter((o) => o.values.kind !== 'Safe behaviour').reduce<Record<string, number>>((m, o) => ({ ...m, [String(o.values.category)]: (m[String(o.values.category)] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
      areas: (d['she.areas'] ?? []).map((a) => {
        const scores = byArea(d['she.inspections'] ?? [], a.id).map((i) => Number(i.values.score))
        return { area: a, permits: byArea(permits, a.id).filter((p) => p.status === 'active' || p.status === 'requested').length, incidents: byArea(incidents, a.id).filter((r) => r.values.kind !== 'Near miss').length, score: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0 }
      }),
      mcu: ['Fit', 'Fit with note', 'Temporarily unfit', 'Unfit'].map((result) => ({ result, n: (d['she.mcu'] ?? []).filter((m) => m.values.result === result).length })),
      ppeLow: (d['she.ppe'] ?? []).filter((p) => p.values.state === 'Reorder'),
      fireDue: dueWithin(d['she.fireequipment'] ?? [], 'nextService', today, 30),
      waste: (d['she.waste'] ?? []).reduce<Record<string, number>>((m, w) => ({ ...m, [String(w.values.wasteCode)]: (m[String(w.values.wasteCode)] ?? 0) + Number(w.values.qty) }), {}),
      wasteStored: (d['she.waste'] ?? []).filter((w) => w.status === 'stored').length,
    }
  }, [all.data, entities.data, today])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const d = all.data
  const matrix = matrixOf(d)
  const list = (key: string, query = '') => `${recordPath(t(key))}${query}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label="View" options={VIEWS} value={view} onChange={(v) => setParams(v === 'overview' ? {} : { view: v }, { replace: true })} />
        <p className="text-xs text-muted tabular">{count(Math.round(k.manHours / 1e3))}k hours worked in 180 days</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Days without LTI" value={k.rates.daysSinceLti ?? 0} format={(v) => count(Math.round(v))} to={list('she.incidents', '?f=Lost time injury')} accent note={`${k.rates.lti} LTI in the register`} />
        <KpiTile label="LTIFR" value={k.rates.ltifr} format={(v) => v.toFixed(2)} to={list('she.incidents')} note="per 1,000,000 hours" />
        <KpiTile label="TRIR" value={k.rates.trir} format={(v) => v.toFixed(2)} to={list('she.incidents')} note={`${k.rates.recordable} recordable, per 200,000 h`} />
        <KpiTile label="Permits active" value={k.activePermits} format={(v) => String(Math.round(v))} to={list('she.permits', '?status=active')} note="hot work, confined space and more" />
        <KpiTile label="CAPA overdue" value={k.capaOverdue.length} format={(v) => String(Math.round(v))} to={list('she.capa')} note="past due, not yet verified" />
        <KpiTile label="Licences due, 60 days" value={k.licences.length} format={(v) => String(Math.round(v))} to={list('she.licences', '?status=renewal')} note="SIO, Ahli K3, first aid" />
      </div>

      {view === 'overview' && (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-2">
              <CardHeader title="Safety pyramid" icon={<ShieldAlert aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">180 days</span>} />
              <ol className="flex flex-col items-center gap-1.5">
                {k.pyramid.map((p, i) => (
                  <li key={p.kind} className="w-full">
                    <Link
                      to={i < INCIDENT_KINDS.length ? list('she.incidents', `?f=${encodeURIComponent(p.kind)}`) : list('she.observations')}
                      className={cn('mx-auto flex h-9 items-center justify-between rounded-xl px-3 text-xs font-medium transition-[width,opacity] duration-700 hover:opacity-85', PYRAMID_TONE[i])}
                      style={{ width: `${34 + (i / (k.pyramid.length - 1)) * 66}%` }}
                    >
                      <span className="truncate">{p.kind}</span>
                      <span className="tabular font-semibold">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">{Math.round(k.pyramid.slice(-2).reduce((s, p) => s + p.count, 0) / Math.max(1, k.rates.recordable))} near misses and unsafe acts for every recordable case.</p>
            </Card>
            <Card className="xl:col-span-3">
              <CardHeader title="Incidents, near misses and observations, 6 months" />
              <LineChart
                labels={k.trend.incidents.map((m) => monthLabel(m.month))}
                series={[
                  { id: 'obs', label: 'Observations', values: k.trend.observations.map((m) => m.count), color: 'var(--color-series-2)', area: true },
                  { id: 'nm', label: 'Near misses', values: k.trend.nearMiss.map((m) => m.count), color: 'var(--color-series-3)' },
                  { id: 'inc', label: 'Incidents', values: k.trend.incidents.map((m) => m.count), color: 'var(--color-series-1)' },
                ]}
                format={(v) => `${v} reports`}
                height={230}
                label="Incidents, near misses and safety observations per month"
              />
              <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-2" /> Observations</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-3" /> Near misses</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-series-1" /> Incidents</span>
              </p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Work areas" action={<span className="text-xs text-muted">open permits · incidents · inspection score</span>} />
              <ul className="divide-y divide-line">
                {k.areas.map(({ area, permits, incidents, score }) => (
                  <li key={area.id} data-motion="row">
                    <Link to={recordPath(t('she.areas'), area.id)} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 text-sm hover:opacity-80 sm:grid-cols-[1fr_9rem_5rem_8rem]">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{String(area.values.name)}</span>
                        <span className="block truncate text-xs text-muted">{refTitle('mdm.plants', String(area.values.plant), d).split(' · ')[0]}</span>
                      </span>
                      <span className={cn('justify-self-end rounded-full px-2 py-0.5 text-xs font-medium sm:justify-self-start', String(area.values.riskClass).startsWith('Major') ? 'bg-accent-soft text-accent-text' : area.values.riskClass === 'High' ? 'bg-warning-soft text-warning' : 'bg-raised text-muted')}>
                        {String(area.values.riskClass)}
                      </span>
                      <span className="text-xs text-muted tabular">{permits} PTW · {incidents} inc</span>
                      <span className="flex items-center gap-2">
                        <Meter value={score / 100} tone={score >= 85 ? 'success' : 'accent'} className="flex-1" label={`Inspection score ${String(area.values.name)}`} />
                        <span className="w-9 text-right text-xs tabular">{Math.round(score)}%</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Unsafe acts by category" />
              <BarList items={k.categories.map(([key, value], i) => ({ key, label: key, value, alert: i === 0, to: list('she.observations', `?q=${encodeURIComponent(key)}`) }))} />
              <Link to={list('she.observations')} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline">
                All observations <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </Card>
          </div>
        </>
      )}

      {view === 'permits' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((status) => {
            const rows = k.permits.filter((p) => p.status === status).sort((a, b) => String(b.values.start).localeCompare(String(a.values.start)))
            const state = t('she.permits').workflow.states.find((s) => s.id === status)!
            return (
              <Card key={status} className="min-w-0">
                <CardHeader title={state.label} action={<span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular" style={{ background: TONE_COLOR[state.tone] }}>{rows.length}</span>} />
                <ul className="space-y-2">
                  {rows.slice(0, 8).map((p) => {
                    const chain = approvalChain(t('she.permits'), p, matrix)
                    const step = status === 'requested' ? pendingStep(chain, p.approvals) : undefined
                    return (
                      <li key={p.id} data-motion="row">
                        <Link to={recordPath(t('she.permits'), p.id)} className="block rounded-panel bg-raised p-3 hover:bg-control">
                          <span className="flex items-center justify-between gap-2 text-xs text-muted">
                            <span className="font-mono">{p.id}</span>
                            <span className={cn('rounded-full px-2 py-0.5 font-medium', p.values.gasTest === 'Fail' ? 'bg-accent-soft text-accent-text' : 'bg-card')}>{String(p.values.kind)}</span>
                          </span>
                          <span className="mt-1 block text-sm font-medium">{String(p.values.job)}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted">{refTitle('she.areas', String(p.values.area), d).split(' · ')[0]} · {String(p.values.start)}</span>
                          {p.values.gasTest === 'Fail' && <span className="mt-1 block text-xs font-semibold text-accent-text">Gas test failed: LEL {String(p.values.lel)}%</span>}
                          {step && <span className="mt-1 block text-xs text-muted">Level {step.level} of {chain.length}: {step.role}</span>}
                        </Link>
                      </li>
                    )
                  })}
                  {rows.length === 0 && <li className="text-sm text-muted">No permits here.</li>}
                </ul>
                {rows.length > 8 && (
                  <Link to={list('she.permits', `?status=${status}`)} className="mt-3 inline-flex text-xs font-medium text-accent-text hover:underline">
                    All {rows.length}
                  </Link>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {view === 'health' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Medical fitness (MCU)" />
            <div className="flex flex-col items-center gap-3">
              <Donut
                size={170}
                stroke={20}
                slices={k.mcu.map((m, i) => ({ id: m.result, label: m.result, value: m.n, color: ['var(--color-success)', 'var(--color-series-2)', 'var(--color-warning)', 'var(--color-danger)'][i]! })).filter((s) => s.value > 0)}
                active={null}
                onActive={() => {}}
                chip={(s) => `${s.label}, ${s.value}`}
                label="Medical check-up results"
              >
                <p className="text-xs text-muted">Examined</p>
                <p className="text-lg font-semibold tabular">{k.mcu.reduce((s, m) => s + m.n, 0)}</p>
              </Donut>
              <BarList items={k.mcu.map((m) => ({ key: m.result, label: m.result, value: m.n, alert: m.result.includes('unfit') || m.result === 'Unfit', to: list('she.mcu', `?f=${encodeURIComponent(m.result)}`) }))} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Licences and certificates due" />
            <ul className="divide-y divide-line">
              {k.licences.slice(0, 8).map((l) => (
                <li key={l.id} data-motion="row">
                  <Link to={recordPath(t('she.licences'), l.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{String(l.values.licence)}</span>
                      <span className="block truncate text-xs text-muted">{refTitle('mdm.employees', String(l.values.employee), d).split(' · ')[0]}</span>
                    </span>
                    <span className={cn('text-xs tabular', String(l.values.expiry) < today ? 'font-semibold text-accent-text' : 'text-muted')}>{String(l.values.expiry)}</span>
                    <StateBadge type={t('she.licences')} status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="B3 waste by code" icon={<FlaskConical aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">{k.wasteStored} manifests in TPS</span>} />
            <BarList items={Object.entries(k.waste).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: key, value, text: `${value.toFixed(1)} t`, to: list('she.waste', `?f=${encodeURIComponent(key)}`) }))} />
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Fire equipment due for service, 30 days" />
            <ul className="grid gap-2 sm:grid-cols-2">
              {k.fireDue.slice(0, 10).map((f) => (
                <li key={f.id}>
                  <Link to={recordPath(t('she.fireequipment'), f.id)} className="flex items-center gap-3 rounded-panel bg-raised p-3 text-sm hover:bg-control">
                    <span className="font-mono text-xs font-semibold">{String(f.values.tag)}</span>
                    <span className="min-w-0 flex-1 truncate">{String(f.values.kind)} · {refTitle('she.areas', String(f.values.area), d).split(' · ')[0]}</span>
                    <span className={cn('text-xs tabular', String(f.values.nextService) < today ? 'font-semibold text-accent-text' : 'text-muted')}>{String(f.values.nextService)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="PPE to reorder" />
            <BarList
              items={k.ppeLow.map((p) => ({ key: p.id, label: String(p.values.name), value: Number(p.values.stock), text: `${String(p.values.stock)} / min ${String(p.values.minimum)}`, alert: true, to: recordPath(t('she.ppe'), p.id) }))}
              empty="Every PPE item is above its minimum."
            />
          </Card>
        </div>
      )}
    </div>
  )
}
