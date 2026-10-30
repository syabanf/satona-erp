/** Operational records behind the live views: sites, fleet, tanks, distribution, genealogy, integration. */
import type { EntityId } from './erp'

export type LatLng = readonly [number, number]

export interface Site {
  id: string
  name: string
  entity: EntityId
  kind: 'hq' | 'plant' | 'depot' | 'tank-farm' | 'warehouse'
  at: LatLng
  city: string
  staff: number
  /** Share of design capacity in use, 0..1. */
  utilisation: number
}

export type TruckState = 'moving' | 'loading' | 'alert'

export interface Truck {
  id: string
  plate: string
  driver: string
  cargo: string
  /** UN number and hazard class of the load, for the B3 manifest. */
  hazard: string
  manifest: string
  route: readonly LatLng[]
  from: string
  to: string
  state: TruckState
  speed: number
  tankTemp: number
  tankPressure: number
  /** Where the truck stands along its route at load time, 0..1. */
  progress: number
  /** Last 12 speed readings in km/h. */
  speedTrace: readonly number[]
  certExpiry: string
}

export interface Tank {
  id: string
  product: string
  capacity: number
  level: number
  reorderAt: number
  temp: number
  pressure: number
  /** 24 hourly level readings in percent. */
  trend: readonly number[]
  supplier: string
}

export interface Region {
  id: string
  name: string
  at: LatLng
  zoom: number
  subsidyQuota: number
  subsidyUsed: number
  commercialQuota: number
  commercialUsed: number
}

export interface Distributor {
  id: string
  region: string
  name: string
  at: LatLng
  kiosks: number
  ordersMtd: number
  stockDays: number
  manager: string
}

export type LotState = 'released' | 'hold' | 'recalled'
export type TraceStage = 'vendor' | 'tank' | 'reactor' | 'truck' | 'customer'

export interface TraceNode {
  id: string
  stage: TraceStage
  label: string
  detail: string
}

export interface Lot {
  id: string
  product: string
  produced: string
  qty: number
  state: LotState
  nodes: readonly TraceNode[]
  /** Edges as [from, to] node ids, always one stage to the next. */
  links: ReadonlyArray<readonly [string, string]>
}

export interface IntegrationComponent {
  id: string
  name: string
  role: string
  scope: string
  team: string
  users: string
  /** Messages, rows or requests per second over the last 12 minutes. */
  throughput: readonly number[]
  unit: string
  uptime: number
}

export interface Alert {
  id: string
  tone: 'danger' | 'warning' | 'info'
  title: string
  detail: string
  to: string
}

export const STAGES: readonly TraceStage[] = ['vendor', 'tank', 'reactor', 'truck', 'customer']
export const STAGE_LABEL: Record<TraceStage, string> = {
  vendor: 'Vendor lot',
  tank: 'Raw tank',
  reactor: 'Reactor batch',
  truck: 'Shipment',
  customer: 'Customer',
}
export const LOT_LABEL: Record<LotState, string> = { released: 'Released', hold: 'On hold', recalled: 'Recalled' }
export const TRUCK_LABEL: Record<TruckState, string> = { moving: 'On route', loading: 'Loading', alert: 'Alert' }

/** Speed limit for B3 tankers on toll roads, km/h. */
export const SPEED_LIMIT = 80

export type TankStatus = 'ok' | 'reorder' | 'high'

export function tankStatus(t: Pick<Tank, 'level' | 'reorderAt'>): TankStatus {
  if (t.level <= t.reorderAt) return 'reorder'
  return t.level >= 92 ? 'high' : 'ok'
}

/** Point at `progress` (0..1) along a polyline, by straight-line length. */
export function pointAlong(route: readonly LatLng[], progress: number): LatLng {
  const first = route[0]
  if (!first || route.length === 1) return first ?? [0, 0]
  const legs = route.slice(1).map((p, i) => {
    const a = route[i] as LatLng
    return { a, b: p, len: Math.hypot(p[0] - a[0], p[1] - a[1]) }
  })
  const total = legs.reduce((s, l) => s + l.len, 0)
  let left = Math.min(Math.max(progress, 0), 1) * total
  for (const { a, b, len } of legs) {
    if (left <= len) {
      const t = len ? left / len : 0
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    left -= len
  }
  return route[route.length - 1] as LatLng
}

/** Every node upstream and downstream of `id`, the set a recall touches. */
export function traceFrom(lot: Pick<Lot, 'links'>, id: string): Set<string> {
  const walk = (dir: 0 | 1) => {
    const hit = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const link of lot.links) {
        const from = link[dir]
        const to = link[dir === 0 ? 1 : 0]
        if (hit.has(from) && !hit.has(to)) {
          hit.add(to)
          grew = true
        }
      }
    }
    return hit
  }
  return new Set([...walk(0), ...walk(1)])
}

export const usage = (used: number, quota: number) => (quota ? used / quota : 0)
