import { useState } from 'react'
import { Circle, CircleMarker, useMapEvents } from 'react-leaflet'
import { Crosshair } from 'lucide-react'
import { can } from '@/domain/erp'
import type { ErpRecord, RecordType } from '@/domain/records'
import { useAccess } from '../hooks/useRecords'
import { BaseMap } from '../maps/BaseMap'
import { Button } from '../ui/Button'
import { useRecordActions } from './useRecordActions'

function ClickToMove({ onMove }: { onMove: (at: [number, number]) => void }) {
  useMapEvents({ click: (e) => onMove([Math.round(e.latlng.lat * 10_000) / 10_000, Math.round(e.latlng.lng * 10_000) / 10_000]) })
  return null
}

/**
 * Sets a geofence on the map: click to move the centre, slide to change the radius, then save.
 * Roles that cannot edit see the same map without the controls.
 */
export function GeofenceEditor({ type, record }: { type: RecordType; record: ErpRecord }) {
  const actions = useRecordActions()
  const editable = can(useAccess()(type.module), 'edit')
  const saved: [number, number] = [Number(record.values.lat) || -6.6, Number(record.values.lng) || 109.2]
  const [at, setAt] = useState<[number, number]>(saved)
  const [radius, setRadius] = useState(Number(record.values.radius) || 300)
  const [busy, setBusy] = useState(false)
  const dirty = at[0] !== saved[0] || at[1] !== saved[1] || radius !== Number(record.values.radius)

  async function save() {
    setBusy(true)
    try {
      await actions.update(type, record.id, { ...record.values, lat: at[0], lng: at[1], radius })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <BaseMap center={saved} zoom={14} focus={{ at, zoom: 14 }} className="h-80" label={`Geofence ${String(record.values.name ?? record.id)}`}>
        {editable && <ClickToMove onMove={setAt} />}
        <Circle center={at} radius={radius} pathOptions={{ className: 'mark-fence-on' }} />
        <CircleMarker center={at} radius={6} pathOptions={{ className: 'mark-place-on' }} />
      </BaseMap>
      {editable ? (
        <div className="space-y-3 rounded-panel bg-raised p-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Crosshair aria-hidden className="size-4" /> Klik peta untuk memindahkan titik pusat. Pusat: <span className="font-mono text-xs text-fg">{at[0]}, {at[1]}</span>
          </p>
          <label className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-24 font-medium">Radius</span>
            <input type="range" min={50} max={3000} step={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="min-w-40 flex-1 accent-[var(--color-accent)]" aria-label="Radius geofence dalam meter" />
            <span className="w-20 text-right font-semibold tabular">{radius} m</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" size="sm" loading={busy} disabled={!dirty} onClick={save}>
              Simpan geofence
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAt(saved)
                  setRadius(Number(record.values.radius) || 300)
                }}
              >
                Batalkan
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Radius {radius} m. Peran Anda hanya bisa melihat geofence ini.</p>
      )}
    </div>
  )
}
