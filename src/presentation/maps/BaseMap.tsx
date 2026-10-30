import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '@/domain/ops'
import { cn } from '@/lib/cn'
import { useTheme } from '../hooks/useTheme'
import { prefersReducedMotion } from '../ui/animate'

const TILES = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}
const ATTRIBUTION = 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'

/** Flies to `to` whenever it changes, so drilling into a region or truck moves the camera. */
function FlyTo({ to, zoom }: { to?: LatLng; zoom?: number }) {
  const map = useMap()
  const lat = to?.[0]
  const lng = to?.[1]
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: prefersReducedMotion() ? 0 : 1.1 })
  }, [map, lat, lng, zoom])
  return null
}

interface BaseMapProps {
  center: LatLng
  zoom: number
  /** Camera target after a drill-down; the map flies there. */
  focus?: { at: LatLng; zoom?: number }
  children?: ReactNode
  className?: string
  label: string
}

/** Leaflet map on Esri grey canvas tiles that follow the theme. The wheel scrolls the page; the +/- buttons zoom. */
export function BaseMap({ center, zoom, focus, children, className, label }: BaseMapProps) {
  const [theme] = useTheme()
  return (
    <div role="region" aria-label={label} className={cn('relative isolate overflow-hidden rounded-panel', className)}>
      <MapContainer center={[center[0], center[1]]} zoom={zoom} scrollWheelZoom={false} className="size-full" attributionControl>
        <TileLayer key={theme} url={TILES[theme]} attribution={ATTRIBUTION} maxZoom={16} />
        <FlyTo to={focus?.at} zoom={focus?.zoom} />
        {children}
      </MapContainer>
    </div>
  )
}
