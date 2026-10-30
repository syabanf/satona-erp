import { divIcon } from 'leaflet'
import { CircleMarker, Marker, Tooltip } from 'react-leaflet'
import type { Entity } from '@/domain/erp'
import type { Site } from '@/domain/ops'

const RADIUS: Record<Site['kind'], number> = { hq: 9, plant: 9, 'tank-farm': 7, depot: 6, warehouse: 6 }

const ring = divIcon({
  className: '',
  iconSize: [36, 36],
  html: '<span class="absolute inset-0 rounded-full border-2 border-accent animate-ping-ring"></span>',
})

/** One circle per site in its entity's series colour; the selected site carries a pulsing ring. */
export function SiteMarkers({
  sites,
  entities,
  selected,
  onSelect,
}: {
  sites: readonly Site[]
  entities: readonly Entity[]
  selected?: string
  onSelect: (id: string) => void
}) {
  const slot = (s: Site) => entities.find((e) => e.id === s.entity)?.slot ?? 0
  return (
    <>
      {sites.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.at[0], s.at[1]]}
          radius={RADIUS[s.kind]}
          pathOptions={{ className: `mark-${slot(s)}`, weight: 3, fillOpacity: 0.85, opacity: 0.35 }}
          eventHandlers={{ click: () => onSelect(s.id) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {s.name}
          </Tooltip>
        </CircleMarker>
      ))}
      {sites
        .filter((s) => s.id === selected)
        .map((s) => (
          <Marker key={`ring-${s.id}`} position={[s.at[0], s.at[1]]} icon={ring} interactive={false} />
        ))}
    </>
  )
}
