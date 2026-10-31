/** Where a record sits on the map, worked out from its city, province, lane or the records it points to. */
import type { LatLng } from './ops'
import type { ErpRecord, RecordType } from './records'

const CITIES: Record<string, LatLng> = {
  jakarta: [-6.2088, 106.8456],
  cilegon: [-6.0171, 106.0539],
  merak: [-5.93, 105.99],
  cikampek: [-6.419, 107.456],
  karawang: [-6.3, 107.3],
  bandung: [-6.9175, 107.6191],
  semarang: [-6.95, 110.42],
  surabaya: [-7.2575, 112.7521],
  gresik: [-7.1554, 112.6337],
  malang: [-7.9666, 112.6326],
  banyuwangi: [-8.2, 114.37],
  palembang: [-2.99, 104.76],
  'bandar lampung': [-5.45, 105.26],
  bontang: [0.13, 117.5],
}
const PROVINCES: Record<string, LatLng> = {
  'jawa timur': [-7.5, 112.4],
  'jawa tengah': [-7.15, 110.2],
  'jawa barat': [-6.9, 107.6],
  lampung: [-5.1, 105.2],
  'sumatera selatan': [-3.3, 104.2],
  'sulawesi selatan': [-4.2, 120.0],
}

export interface Geo {
  at: LatLng
  /** A route from origin to destination, when the record travels. */
  line?: readonly LatLng[]
  place: string
}

type All = Readonly<Record<string, readonly ErpRecord[]>>
type TypeOf = (key: string) => RecordType | undefined

/** The first known city named in a text, so "Depot Cilegon" and "Cilegon → Cikampek" both resolve. */
export function cityIn(text: unknown): { name: string; at: LatLng } | undefined {
  const s = String(text ?? '').toLowerCase()
  const hit = Object.keys(CITIES)
    .filter((c) => s.includes(c))
    .sort((a, b) => s.indexOf(a) - s.indexOf(b))[0]
  return hit ? { name: hit.replace(/\b\w/g, (c) => c.toUpperCase()), at: CITIES[hit]! } : undefined
}

function own(type: RecordType, record: ErpRecord): Geo | undefined {
  const v = record.values
  // Exact coordinates, such as a geofence centre, win over anything named.
  if (typeof v.lat === 'number' && typeof v.lng === 'number') return { at: [v.lat, v.lng], place: String(v[type.titleField] ?? record.id) }
  for (const key of ['city', 'region', 'province']) {
    const raw = String(v[key] ?? '')
    const at = CITIES[raw.toLowerCase()] ?? PROVINCES[raw.toLowerCase()]
    if (at) return { at, place: raw }
  }
  if (type.key === 'tms.locations' || type.key === 'mdm.plants') {
    const city = cityIn(v.name)
    if (city) return { at: city.at, place: city.name }
  }
  return undefined
}

/** Origin and destination from the lane's two locations, or from the two cities in its name. */
function lane(record: ErpRecord, all: All): Geo | undefined {
  const point = (id: unknown) => {
    const loc = (all['tms.locations'] ?? []).find((l) => l.id === id)
    return cityIn(loc?.values.city) ?? cityIn(loc?.values.name)
  }
  const [a, b] = String(record.values.name ?? '').split('→')
  const from = cityIn(a) ?? point(record.values.origin)
  const to = cityIn(b) ?? point(record.values.destination)
  if (!from || !to) return undefined
  return { at: from.at, line: [from.at, to.at], place: `${from.name} → ${to.name}` }
}

/**
 * The record's own place first, then a lane, then the first referenced record that has a place,
 * up to `depth` links away (a trip through its lane, a kiosk through its distributor).
 */
export function geoOf(type: RecordType, record: ErpRecord, all: All, typeOf: TypeOf, depth = 2): Geo | undefined {
  if (type.key === 'tms.lanes') return lane(record, all)
  const mine = own(type, record)
  if (mine || depth <= 0) return mine
  for (const f of type.fields) {
    if (f.type !== 'ref' || !f.ref || f.ref === type.key) continue
    const target = typeOf(f.ref)
    const linked = (all[f.ref] ?? []).find((r) => r.id === record.values[f.key])
    const geo = target && linked && geoOf(target, linked, all, typeOf, depth - 1)
    if (geo) return geo
  }
  return undefined
}

/** Each company's main site, where records without a place of their own go on the map. */
const HOME: Record<string, { city: string; site: string }> = {
  holding: { city: 'jakarta', site: 'Satona HQ Jakarta' },
  rotama: { city: 'cikampek', site: 'Rotama Fleet Pool Cikampek' },
  rodame: { city: 'gresik', site: 'Rodame NPK Plant Gresik' },
  roasi: { city: 'cilegon', site: 'Roasi Acid Plant Cilegon' },
}

/**
 * The record's own place, or else the main site of its company: the record's first entity field, then
 * `homeEntity` (the entity that owns the module). Every record gets a place this way.
 */
export function placeOf(type: RecordType, record: ErpRecord, all: All, typeOf: TypeOf, homeEntity?: string): Geo | undefined {
  const geo = geoOf(type, record, all, typeOf)
  if (geo) return geo
  const entity = type.fields.find((f) => f.type === 'entity' && record.values[f.key])
  const home = HOME[String(entity ? record.values[entity.key] : homeEntity)]
  return home && { at: CITIES[home.city]!, place: home.site }
}

/** Whether a record type can show on the map: its first record resolves to a place. */
export const mappable = (type: RecordType, all: All, typeOf: TypeOf) => (all[type.key] ?? []).slice(0, 5).some((r) => geoOf(type, r, all, typeOf))
