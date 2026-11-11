import { describe, expect, it } from 'vitest'
import type { Site, Truck } from './ops'
import { processReading, scadaReading, scadaTags, stationState, truckTelemetry, worstState } from './telemetry'

const truck = (state: Truck['state']): Truck => ({ id: 'tk-1', plate: 'B 1', driver: 'D', cargo: 'C', hazard: 'H', manifest: 'M', route: [], from: 'A', to: 'B', state, speed: 70, tankTemp: 30, tankPressure: 2, progress: 0.4, speedTrace: [], certExpiry: '' })
const plant: Site = { id: 'rs-cilegon', name: 'Plant', entity: 'roasi', kind: 'plant', at: [0, 0], city: 'Cilegon', staff: 1, utilisation: 0.9 }

describe('truck telemetry', () => {
  it('idles parked trucks and runs alert trucks hot', () => {
    expect(truckTelemetry(truck('loading'), 5, 0).rpm).toBe(650)
    expect(truckTelemetry(truck('alert'), 5, 70).coolant).toBeGreaterThan(truckTelemetry(truck('moving'), 5, 70).coolant)
    expect(truckTelemetry(truck('moving'), 5, 70).tempTrace).toHaveLength(12)
  })
})

describe('scada', () => {
  it('gives each site kind its own tags', () => {
    expect(scadaTags(plant).map((t) => t.key)).toContain('reactor')
  })

  it('pushes a degraded site towards its limits and freezes an offline one', () => {
    const tag = scadaTags(plant)[0]!
    expect(scadaReading(plant, tag, 3, 'degraded').value).toBeGreaterThan(scadaReading(plant, tag, 3, 'connected').value)
    expect(scadaReading(plant, tag, 3, 'offline')).toEqual(scadaReading(plant, tag, 99, 'offline'))
  })

  it('takes the worst source state', () => {
    expect(worstState(['connected', 'degraded'])).toBe('degraded')
    expect(worstState(['offline', 'degraded'])).toBe('offline')
    expect(worstState([])).toBe('connected')
  })
})

describe('plant SCADA', () => {
  const tag = { key: 'bed', label: 'Bed', unit: '°C', base: 78, limit: 95 }
  it('reads zero when stopped and over the limit when drifting', () => {
    expect(processReading('WC-1', tag, 3, 'stopped')).toEqual({ value: 0, alarm: false })
    expect(processReading('WC-1', tag, 3, 'drift').alarm).toBe(true)
    expect(processReading('WC-1', tag, 3, 'normal').alarm).toBe(false)
  })
  it('stops a station whose machine is down, else alarms on any reading over its limit', () => {
    expect(stationState('down', true, true)).toBe('stopped')
    expect(stationState('running', true, false)).toBe('alarm')
    expect(stationState(undefined, false, false)).toBe('running')
  })
})
