import { useMemo, useState } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { MapPin } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { geoOf, type Geo } from '@/domain/geo'
import type { ErpRecord, RecordType } from '@/domain/records'
import { cn } from '@/lib/cn'
import { BaseMap } from '../maps/BaseMap'
import { useRecordDrawer } from './drawer'
import { StateBadge } from './StateBadge'
import { recordTitle, type AllRecords } from './text'

const JAVA: [number, number] = [-6.6, 109.2]

/**
 * Records on the map, one mark per place (sized by how many records share it) and one line per route.
 * Picking a mark lists its records below the map; each opens in the drawer.
 */
export function RecordMap({ type, rows, all, className = 'h-[420px]' }: { type: RecordType; rows: readonly ErpRecord[]; all: AllRecords; className?: string }) {
  const open = useRecordDrawer()
  const places = useMemo(() => {
    const out = new Map<string, { geo: Geo; records: ErpRecord[] }>()
    for (const r of rows) {
      const geo = geoOf(type, r, all, typeOf)
      if (!geo) continue
      const hit = out.get(geo.place) ?? { geo, records: [] }
      hit.records.push(r)
      out.set(geo.place, hit)
    }
    return [...out.values()].sort((a, b) => b.records.length - a.records.length)
  }, [type, rows, all])
  const [picked, setPicked] = useState<string | null>(places.length === 1 ? (places[0]?.geo.place ?? null) : null)
  const chosen = places.find((p) => p.geo.place === picked)
  const most = Math.max(1, ...places.map((p) => p.records.length))
  const located = places.reduce((n, p) => n + p.records.length, 0)

  return (
    <div className="space-y-3">
      <BaseMap center={JAVA} zoom={6} focus={chosen ? { at: chosen.geo.at, zoom: 7 } : places.length === 1 && places[0] ? { at: places[0].geo.at, zoom: 7 } : undefined} className={className} label={`${type.name} on the map`}>
        {places.map(({ geo, records }) =>
          geo.line ? (
            <Polyline
              key={`line-${geo.place}`}
              positions={geo.line.map((p) => [p[0], p[1]] as [number, number])}
              pathOptions={{ className: geo.place === picked ? 'mark-route-active' : 'mark-lane', weight: 2 + Math.round((records.length / most) * 5) }}
              eventHandlers={{ click: () => setPicked(geo.place) }}
            />
          ) : null,
        )}
        {places.map(({ geo, records }) => (
          <CircleMarker
            key={`pt-${geo.place}`}
            center={[geo.line?.at(-1)?.[0] ?? geo.at[0], geo.line?.at(-1)?.[1] ?? geo.at[1]]}
            radius={6 + Math.round((records.length / most) * 10)}
            pathOptions={{ className: geo.place === picked ? 'mark-place-on' : 'mark-place' }}
            eventHandlers={{ click: () => setPicked(geo.place === picked ? null : geo.place) }}
          >
            <Tooltip direction="top">
              {geo.place} · {records.length} {records.length === 1 ? type.singular.toLowerCase() : type.name.toLowerCase()}
            </Tooltip>
          </CircleMarker>
        ))}
      </BaseMap>

      <div className="flex flex-wrap gap-1.5" role="list" aria-label="Places">
        {places.map(({ geo, records }) => (
          <button
            key={geo.place}
            type="button"
            role="listitem"
            aria-pressed={geo.place === picked}
            onClick={() => setPicked(geo.place === picked ? null : geo.place)}
            className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors', geo.place === picked ? 'bg-invert text-on-invert' : 'bg-raised text-body hover:bg-control')}
          >
            <MapPin aria-hidden className="size-3.5" />
            {geo.place}
            <span className="tabular opacity-70">{records.length}</span>
          </button>
        ))}
        {located < rows.length && <span className="self-center text-xs text-muted">{rows.length - located} without a place</span>}
      </div>

      {chosen && (
        <ul className="divide-y divide-line rounded-panel border border-line">
          {chosen.records.slice(0, 12).map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => open({ mode: 'view', type: type.key, id: r.id })} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-raised">
                <span className="font-mono text-xs text-muted">{r.id}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{recordTitle(type, r, all)}</span>
                <StateBadge type={type} status={r.status} />
              </button>
            </li>
          ))}
          {chosen.records.length > 12 && <li className="px-3 py-2 text-xs text-muted">and {chosen.records.length - 12} more in the list</li>}
        </ul>
      )}
    </div>
  )
}
