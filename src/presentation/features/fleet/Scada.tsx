import { useMemo } from 'react'
import { Link } from 'react-router'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { ArrowLeft, Radio } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import type { Site } from '@/domain/ops'
import type { ErpRecord } from '@/domain/records'
import { scadaReading, scadaTags, worstState, type ScadaState } from '@/domain/telemetry'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { RecordControls } from '../../records/RecordControls'
import { StateBadge } from '../../records/StateBadge'
import { recordPath } from '../../records/text'
import { StatusPill, type Tone } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'

export const SCADA_LABEL: Record<ScadaState, string> = { connected: 'Terhubung', degraded: 'Terganggu', offline: 'Terputus' }
const SCADA_TONE: Record<ScadaState, Tone> = { connected: 'success', degraded: 'warning', offline: 'danger' }

export interface ScadaSite {
  site: Site
  state: ScadaState
  /** OCC data sources at this site (DCS, PLC, IoT, GPS, CCTV, energy meters). */
  sources: readonly ErpRecord[]
  integrated: boolean
}

/** Each site's SCADA state from its OCC data-source records; sources still "not integrated" do not count. */
export function useScadaSites(sites: readonly Site[]): ScadaSite[] {
  const all = useAllRecords()
  return useMemo(() => {
    const plants = all.data?.['mdm.plants'] ?? []
    const sources = all.data?.['occ.sources'] ?? []
    return sites.map((site) => {
      const plantIds = new Set(plants.filter((p) => p.values.name === site.name).map((p) => p.id))
      const mine = sources.filter((s) => plantIds.has(String(s.values.site)))
      const live = mine.filter((s) => s.status !== 'planned')
      return { site, sources: mine, integrated: live.length > 0, state: live.length ? worstState(live.map((s) => s.status)) : 'offline' }
    })
  }, [sites, all.data])
}

/** SCADA points on the map: green connected, yellow degraded, red offline or not yet integrated; the picked one is larger. */
export function ScadaMarkers({ sites, picked, onPick }: { sites: readonly ScadaSite[]; picked?: string; onPick: (id: string) => void }) {
  return (
    <>
      {sites.map(({ site, state, integrated }) => (
        <CircleMarker
          key={`scada-${site.id}`}
          center={[site.at[0], site.at[1]]}
          radius={site.id === picked ? 13 : 9}
          pathOptions={{ className: `mark-scada-${integrated ? state : 'offline'}`, weight: site.id === picked ? 4 : 2 }}
          eventHandlers={{ click: () => onPick(site.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {site.name} · SCADA {integrated ? SCADA_LABEL[state].toLowerCase() : 'belum terintegrasi'}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

/** All sites with their SCADA state, sources and live alarms; a row focuses that site. */
export function ScadaTable({ sites, elapsed, onPick }: { sites: readonly ScadaSite[]; elapsed: number; onPick: (id: string) => void }) {
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 p-5 pb-3">
        <Radio aria-hidden className="size-5 text-muted" />
        <h2 className="text-lg font-semibold">Status SCADA per lokasi</h2>
        <span className="ml-auto text-xs text-muted">
          {sites.filter((s) => s.integrated && s.state === 'connected').length} dari {sites.length} terhubung penuh
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pl-5 font-medium">Lokasi</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sumber data</th>
              <th className="px-3 py-2 font-medium">Alarm aktif</th>
              <th className="py-2 pr-5 font-medium">Sinyal terakhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sites.map(({ site, state, sources, integrated }) => {
              const alarms = integrated ? scadaTags(site).filter((t) => scadaReading(site, t, elapsed, state).alarm).length : 0
              return (
                <tr key={site.id} onClick={() => onPick(site.id)} className="cursor-pointer hover:bg-raised">
                  <td className="py-3 pl-5">
                    <span className="block font-medium">{site.name}</span>
                    <span className="block text-xs text-muted">{site.city}</span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill tone={integrated ? SCADA_TONE[state] : 'neutral'}>{integrated ? SCADA_LABEL[state] : 'Belum terintegrasi'}</StatusPill>
                  </td>
                  <td className="px-3 py-3 text-muted tabular">{sources.length}</td>
                  <td className={cn('px-3 py-3 tabular', alarms ? 'font-semibold text-accent-text' : 'text-muted')}>{alarms}</td>
                  <td className="py-3 pr-5 text-muted tabular">{integrated ? (state === 'offline' ? 'terputus' : `${1 + (Math.round(elapsed) % 5)} dtk lalu`) : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** One site's live tags against their limits, and its data sources with restore and flag actions in place. */
export function ScadaSitePanel({ scada, elapsed, onBack }: { scada: ScadaSite; elapsed: number; onBack: () => void }) {
  const { site, state, sources, integrated } = scada
  const sourceType = typeOf('occ.sources')!
  return (
    <Card className="animate-rise">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="soft" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-3.5" /> Semua truk
        </Button>
        <StatusPill tone={integrated ? SCADA_TONE[state] : 'neutral'}>{integrated ? SCADA_LABEL[state] : 'Belum terintegrasi'}</StatusPill>
      </div>
      <p className="text-xs text-muted">SCADA · {site.city}</p>
      <h2 className="text-2xl font-bold tracking-tight">
        {site.name}
        <span className="text-accent">.</span>
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {scadaTags(site).map((tag) => {
          const { value, alarm } = scadaReading(site, tag, elapsed, state)
          const share = Math.min(1, value / tag.limit)
          return (
            <div key={tag.key} className={cn('rounded-panel p-3', !integrated ? 'bg-raised opacity-60' : alarm ? 'bg-accent-soft text-accent-text' : 'bg-raised')}>
              <p className="text-xs opacity-70">{tag.label}</p>
              <p className="mt-1 text-xl font-semibold tabular">
                {integrated ? value : '-'} <span className="text-xs font-normal opacity-70">{tag.unit}</span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-control">
                <div className={cn('h-full rounded-full transition-[width] duration-500', alarm ? 'bg-accent' : share > 0.85 ? 'bg-warning' : 'bg-success')} style={{ width: `${integrated ? share * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-[11px] opacity-70">batas {tag.limit} {tag.unit}</p>
            </div>
          )
        })}
      </div>

      <CardHeader title="Sumber data" className="mt-5 mb-2" action={<Link to={recordPath(sourceType)} className="text-xs font-medium text-accent-text hover:underline">Semua sumber</Link>} />
      {sources.length === 0 ? (
        <p className="text-sm text-muted">Belum ada sumber data untuk lokasi ini.</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="rounded-panel bg-raised p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={recordPath(sourceType, s.id)} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {String(s.values.name)}
                </Link>
                <StateBadge type={sourceType} status={s.status} />
              </div>
              <p className="text-xs text-muted">
                {String(s.values.kind)} · {String(s.values.protocol)}
              </p>
              <RecordControls type={sourceType} record={s} className="mt-2" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
