/** Live readings for the fleet and SCADA views: truck telematics and plant tags, deterministic per id so the demo replays. */
import type { Site, Truck } from './ops'

const seed = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const wave = (elapsed: number, s: number, speed = 0.4) => Math.sin(elapsed * speed + (s % 100) / 10)
const round1 = (x: number) => Math.round(x * 10) / 10

export interface TruckTelemetry {
  fuel: number
  rpm: number
  coolant: number
  gpsSats: number
  pingSec: number
  fatigue: number
  tempTrace: readonly number[]
  pressureTrace: readonly number[]
}

/** Engine, GPS and tank readings for one truck; parked trucks idle, alert trucks run hot. */
export function truckTelemetry(t: Truck, elapsed: number, speed: number): TruckTelemetry {
  const s = seed(t.id)
  const moving = t.state !== 'loading'
  const hot = t.state === 'alert'
  return {
    fuel: Math.max(8, Math.round(78 - (s % 40) - t.progress * 30)),
    rpm: moving ? Math.round(1100 + speed * 14 + 60 * wave(elapsed, s, 1.3)) : 650,
    coolant: Math.round(84 + (hot ? 9 : 0) + 2 * wave(elapsed, s)),
    gpsSats: 7 + (s % 6),
    pingSec: Math.round(2 + Math.abs(8 * wave(elapsed, s, 0.2))),
    fatigue: Math.min(100, 22 + (s % 30) + (hot ? 35 : 0)),
    tempTrace: Array.from({ length: 12 }, (_, i) => round1(t.tankTemp - (hot ? (11 - i) * 1.1 : 0) + Math.sin(i + s) * 0.8)),
    pressureTrace: Array.from({ length: 12 }, (_, i) => round1(t.tankPressure + Math.sin(i * 0.9 + s) * 0.25 + (hot ? i * 0.08 : 0))),
  }
}

export type ScadaState = 'connected' | 'degraded' | 'offline'
export interface ScadaTag {
  key: string
  label: string
  unit: string
  base: number
  /** Readings above this raise an alarm. */
  limit: number
}

const TAGS: Record<Site['kind'], readonly ScadaTag[]> = {
  plant: [
    { key: 'reactor', label: 'Suhu reaktor', unit: '°C', base: 420, limit: 445 },
    { key: 'pressure', label: 'Tekanan jalur', unit: 'bar', base: 6.2, limit: 7.5 },
    { key: 'flow', label: 'Laju umpan', unit: 't/h', base: 38, limit: 46 },
    { key: 'so2', label: 'SO₂ cerobong', unit: 'mg/Nm³', base: 610, limit: 800 },
    { key: 'power', label: 'Daya', unit: 'MW', base: 12.4, limit: 15 },
  ],
  'tank-farm': [
    { key: 'level', label: 'Level tangki rata-rata', unit: '%', base: 61, limit: 92 },
    { key: 'pressure', label: 'Tekanan uap', unit: 'bar', base: 1.4, limit: 2.2 },
    { key: 'temp', label: 'Suhu produk', unit: '°C', base: 29, limit: 40 },
    { key: 'lel', label: 'Gas mudah terbakar', unit: '% LEL', base: 3, limit: 10 },
  ],
  depot: [
    { key: 'diesel', label: 'Tangki solar', unit: '%', base: 64, limit: 101 },
    { key: 'gate', label: 'Truk di gerbang', unit: 'unit', base: 4, limit: 9 },
    { key: 'power', label: 'Daya', unit: 'kW', base: 180, limit: 260 },
  ],
  warehouse: [
    { key: 'temp', label: 'Suhu gudang', unit: '°C', base: 31, limit: 38 },
    { key: 'humidity', label: 'Kelembapan', unit: '%RH', base: 64, limit: 80 },
    { key: 'power', label: 'Daya', unit: 'kW', base: 140, limit: 220 },
  ],
  hq: [
    { key: 'uptime', label: 'Jaringan WAN', unit: '%', base: 99.6, limit: 101 },
    { key: 'power', label: 'Daya', unit: 'kW', base: 95, limit: 160 },
  ],
}

export const scadaTags = (site: Site) => TAGS[site.kind]

/** A tag's live value: a slow wave around its base; a degraded site drifts towards its limit, an offline site freezes. */
export function scadaReading(site: Site, tag: ScadaTag, elapsed: number, state: ScadaState) {
  const s = seed(`${site.id}:${tag.key}`)
  const frozen = state === 'offline' ? 0 : elapsed
  const drift = state === 'degraded' ? (tag.limit - tag.base) * 0.85 : 0
  const value = round1(tag.base + drift + tag.base * 0.03 * wave(frozen, s, 0.6))
  return { value, alarm: value > tag.limit }
}

/** The worst of several source states; a site with no source on record is taken as connected. */
export function worstState(states: readonly string[]): ScadaState {
  if (states.includes('offline')) return 'offline'
  if (states.includes('degraded')) return 'degraded'
  return 'connected'
}
