import type { Alert, Distributor, IntegrationComponent, LatLng, Lot, Region, Site, Tank, Truck } from '@/domain/ops'

export const SITES: readonly Site[] = [
  { id: 'hq-jakarta', name: 'Satona HQ', entity: 'holding', kind: 'hq', at: [-6.2088, 106.8456], city: 'Jakarta', staff: 214, utilisation: 0.82 },
  { id: 'rt-cilegon', name: 'Rotama Depot Cilegon', entity: 'rotama', kind: 'depot', at: [-6.0171, 106.0539], city: 'Cilegon', staff: 96, utilisation: 0.77 },
  { id: 'rt-cikampek', name: 'Rotama Fleet Pool Cikampek', entity: 'rotama', kind: 'depot', at: [-6.419, 107.456], city: 'Karawang', staff: 142, utilisation: 0.88 },
  { id: 'rt-surabaya', name: 'Rotama Depot Surabaya', entity: 'rotama', kind: 'warehouse', at: [-7.2575, 112.7521], city: 'Surabaya', staff: 168, utilisation: 0.91 },
  { id: 'rt-semarang', name: 'Rotama Hub Semarang', entity: 'rotama', kind: 'depot', at: [-6.95, 110.42], city: 'Semarang', staff: 80, utilisation: 0.64 },
  { id: 'rd-gresik', name: 'Rodame NPK Plant Gresik', entity: 'rodame', kind: 'plant', at: [-7.1554, 112.6337], city: 'Gresik', staff: 612, utilisation: 0.93 },
  { id: 'rd-palembang', name: 'Rodame Urea Plant Palembang', entity: 'rodame', kind: 'plant', at: [-2.99, 104.76], city: 'Palembang', staff: 388, utilisation: 0.79 },
  { id: 'rd-lampung', name: 'Rodame Bulk Warehouse Lampung', entity: 'rodame', kind: 'warehouse', at: [-5.45, 105.26], city: 'Bandar Lampung', staff: 120, utilisation: 0.71 },
  { id: 'rs-cilegon', name: 'Roasi Acid Plant Cilegon', entity: 'roasi', kind: 'plant', at: [-5.97, 106.01], city: 'Cilegon', staff: 498, utilisation: 0.96 },
  { id: 'rs-merak', name: 'Roasi Tank Farm Merak', entity: 'roasi', kind: 'tank-farm', at: [-5.93, 105.99], city: 'Merak', staff: 64, utilisation: 0.68 },
  { id: 'rs-gresik', name: 'Roasi Tank Farm Gresik', entity: 'roasi', kind: 'tank-farm', at: [-7.17, 112.68], city: 'Gresik', staff: 52, utilisation: 0.74 },
]

const ROUTES: Record<string, readonly LatLng[]> = {
  west: [[-6.0171, 106.0539], [-6.12, 106.15], [-6.17, 106.55], [-6.2088, 106.8456], [-6.27, 107.15], [-6.419, 107.456]],
  malang: [[-7.1554, 112.6337], [-7.2575, 112.7521], [-7.45, 112.72], [-7.6, 112.7], [-7.9666, 112.6326]],
  lampung: [[-6.0171, 106.0539], [-5.93, 105.99], [-5.87, 105.75], [-5.6, 105.6], [-5.45, 105.26]],
  pantura: [[-7.1554, 112.6337], [-7.12, 112.41], [-6.9, 112.05], [-6.71, 111.34], [-6.95, 110.42]],
  central: [[-6.419, 107.456], [-6.55, 107.75], [-6.73, 108.55], [-6.87, 109.14], [-6.97, 109.65], [-6.95, 110.42]],
  sumatra: [[-2.99, 104.76], [-3.6, 104.8], [-4.3, 105.0], [-4.9, 105.2], [-5.45, 105.26]],
  bandung: [[-6.2088, 106.8456], [-6.6, 106.8], [-6.8, 107.2], [-6.9175, 107.6191]],
  east: [[-7.2575, 112.7521], [-7.75, 113.22], [-7.9, 113.8], [-8.2, 114.37]],
}

const trace = (base: number, spike = 0) => Array.from({ length: 12 }, (_, i) => Math.round(base + 6 * Math.sin(i * 1.3) + (i > 8 ? spike : 0)))

type TruckSeed = [id: string, plate: string, driver: string, cargo: string, hazard: string, route: string, from: string, to: string, state: Truck['state'], speed: number, temp: number, progress: number, spike?: number]

const TRUCK_SEED: readonly TruckSeed[] = [
  ['tk-01', 'B 9412 TRA', 'Agus Santoso', 'Sulfuric acid 98%', 'UN1830 · Class 8', 'west', 'Cilegon', 'Cikampek', 'moving', 72, 31, 0.18],
  ['tk-02', 'L 8820 RT', 'Dwi Prasetyo', 'NPK 15-15-15 bulk', 'Non-B3', 'malang', 'Gresik', 'Malang', 'moving', 64, 29, 0.42],
  ['tk-03', 'B 9037 TRA', 'Rudi Hartono', 'Liquid ammonia', 'UN1005 · Class 2.3', 'lampung', 'Cilegon', 'Bandar Lampung', 'alert', 91, 34, 0.55, 24],
  ['tk-04', 'L 8754 RT', 'Slamet Riyadi', 'Phosphoric acid', 'UN1805 · Class 8', 'pantura', 'Gresik', 'Semarang', 'moving', 76, 30, 0.3],
  ['tk-05', 'T 8115 RT', 'Hendra Wijaya', 'Urea granular', 'Non-B3', 'central', 'Cikampek', 'Semarang', 'moving', 69, 28, 0.66],
  ['tk-06', 'BG 8311 RT', 'Yusuf Maulana', 'Urea prilled', 'Non-B3', 'sumatra', 'Palembang', 'Bandar Lampung', 'moving', 58, 30, 0.12],
  ['tk-07', 'B 9550 TRA', 'Teguh Nugroho', 'Caustic soda 48%', 'UN1824 · Class 8', 'bandung', 'Jakarta', 'Bandung', 'alert', 54, 47, 0.48],
  ['tk-08', 'L 8902 RT', 'Bayu Saputra', 'NPK 16-16-16 bagged', 'Non-B3', 'east', 'Surabaya', 'Banyuwangi', 'moving', 70, 29, 0.27],
  ['tk-09', 'B 9208 TRA', 'Iwan Setiawan', 'Molten sulfur', 'UN2448 · Class 4.1', 'west', 'Cilegon', 'Cikampek', 'loading', 0, 132, 0],
  ['tk-10', 'L 8671 RT', 'Fajar Ramadhan', 'Phosphoric acid', 'UN1805 · Class 8', 'malang', 'Gresik', 'Malang', 'moving', 66, 30, 0.81],
]

export const TRUCKS: readonly Truck[] = TRUCK_SEED.map(([id, plate, driver, cargo, hazard, route, from, to, state, speed, temp, progress, spike], i) => ({
  id,
  plate,
  driver,
  cargo,
  hazard,
  manifest: `MB3-2610-${String(4400 + i * 17)}`,
  route: ROUTES[route] ?? [],
  from,
  to,
  state,
  speed,
  tankTemp: temp,
  tankPressure: hazard.includes('2.3') ? 8.6 : 1.2 + (i % 3) * 0.2,
  progress,
  speedTrace: state === 'loading' ? Array(12).fill(0) : trace(speed - (spike ?? 0) / 2, spike),
  certExpiry: i === 6 ? '2026-11-14' : `2027-0${(i % 8) + 1}-15`,
}))

const level = (now: number, drift: number) => Array.from({ length: 24 }, (_, i) => Math.round((now - drift * (23 - i) / 23 + 2 * Math.sin(i / 2)) * 10) / 10)

export const TANKS: readonly Tank[] = [
  { id: 't-101', product: 'Liquid ammonia', capacity: 2_400, level: 64, reorderAt: 30, temp: -33, pressure: 1.1, trend: level(64, -8), supplier: 'Pupuk Kaltim' },
  { id: 't-102', product: 'Phosphoric acid 52%', capacity: 3_200, level: 27, reorderAt: 30, temp: 38, pressure: 1.0, trend: level(27, -22), supplier: 'OCP Morocco' },
  { id: 't-103', product: 'Sulfuric acid 98%', capacity: 5_000, level: 81, reorderAt: 25, temp: 34, pressure: 1.0, trend: level(81, 14), supplier: 'In-house (Roasi CFP)' },
  { id: 't-104', product: 'Molten sulfur', capacity: 1_800, level: 46, reorderAt: 35, temp: 138, pressure: 1.2, trend: level(46, -12), supplier: 'Aramco Trading' },
  { id: 't-105', product: 'Caustic soda 48%', capacity: 1_200, level: 94, reorderAt: 20, temp: 31, pressure: 1.0, trend: level(94, 18), supplier: 'Asahimas Chemical' },
  { id: 't-106', product: 'Oleum 20%', capacity: 900, level: 52, reorderAt: 30, temp: 36, pressure: 1.1, trend: level(52, -4), supplier: 'In-house (Roasi CFP)' },
]

export const REGIONS: readonly Region[] = [
  { id: 'jatim', name: 'Jawa Timur', at: [-7.54, 112.24], zoom: 7, subsidyQuota: 412_000, subsidyUsed: 318_400, commercialQuota: 160_000, commercialUsed: 97_800 },
  { id: 'jateng', name: 'Jawa Tengah', at: [-7.15, 110.14], zoom: 7, subsidyQuota: 356_000, subsidyUsed: 271_900, commercialQuota: 120_000, commercialUsed: 81_200 },
  { id: 'jabar', name: 'Jawa Barat', at: [-6.92, 107.6], zoom: 7, subsidyQuota: 298_000, subsidyUsed: 247_300, commercialQuota: 140_000, commercialUsed: 66_400 },
  { id: 'lampung', name: 'Lampung', at: [-4.85, 105.2], zoom: 7, subsidyQuota: 184_000, subsidyUsed: 109_600, commercialQuota: 76_000, commercialUsed: 52_100 },
  { id: 'sumsel', name: 'Sumatera Selatan', at: [-3.3, 104.2], zoom: 7, subsidyQuota: 152_000, subsidyUsed: 88_700, commercialQuota: 92_000, commercialUsed: 71_500 },
  { id: 'sulsel', name: 'Sulawesi Selatan', at: [-4.2, 120.0], zoom: 7, subsidyQuota: 168_000, subsidyUsed: 149_200, commercialQuota: 58_000, commercialUsed: 30_900 },
]

type DistSeed = [region: string, name: string, at: LatLng, manager: string]

const DIST_SEED: readonly DistSeed[] = [
  ['jatim', 'CV Tani Makmur Jombang', [-7.55, 112.23], 'Bambang S.'],
  ['jatim', 'PT Agro Lestari Kediri', [-7.82, 112.01], 'Rina K.'],
  ['jatim', 'UD Sumber Pangan Jember', [-8.17, 113.7], 'Hadi P.'],
  ['jateng', 'CV Subur Jaya Klaten', [-7.7, 110.6], 'Sri W.'],
  ['jateng', 'PT Mitra Tani Pati', [-6.75, 111.04], 'Joko M.'],
  ['jateng', 'UD Bumi Hijau Cilacap', [-7.72, 109.0], 'Endang L.'],
  ['jabar', 'PT Pangan Raya Indramayu', [-6.33, 108.32], 'Asep R.'],
  ['jabar', 'CV Tani Sejahtera Subang', [-6.57, 107.76], 'Neneng H.'],
  ['jabar', 'UD Karya Tani Garut', [-7.22, 107.9], 'Ujang S.'],
  ['lampung', 'CV Agro Sumatra Metro', [-5.11, 105.31], 'Wayan D.'],
  ['lampung', 'PT Lampung Tani Pringsewu', [-5.36, 104.97], 'Made A.'],
  ['sumsel', 'CV Musi Agro Banyuasin', [-2.9, 104.6], 'Yanto F.'],
  ['sumsel', 'PT OKU Tani Baturaja', [-4.13, 104.17], 'Leni R.'],
  ['sulsel', 'PT Bosowa Tani Bone', [-4.54, 120.33], 'Andi M.'],
  ['sulsel', 'CV Sidrap Makmur', [-3.92, 119.79], 'Rahmat T.'],
  ['sulsel', 'UD Gowa Pangan', [-5.31, 119.74], 'Nurul A.'],
]

export const DISTRIBUTORS: readonly Distributor[] = DIST_SEED.map(([region, name, at, manager], i) => ({
  id: `d-${String(i + 1).padStart(2, '0')}`,
  region,
  name,
  at,
  manager,
  kiosks: 120 + ((i * 37) % 260),
  ordersMtd: 1_800 + ((i * 911) % 6_400),
  stockDays: 4 + ((i * 5) % 19),
}))

/** One genealogy tree: two vendor lots feed a raw tank, a reactor batch, two or three trucks, and their customers. */
function lot(id: string, product: string, produced: string, qty: number, state: Lot['state'], vendors: string[], tank: string, trucks: Array<[string, string]>): Lot {
  const reactor = `R-${id.slice(-4)}`
  const nodes = [
    ...vendors.map((v, i) => ({ id: `v${i}`, stage: 'vendor' as const, label: v.split(' · ')[0] ?? v, detail: v.split(' · ')[1] ?? '' })),
    { id: 'tank', stage: 'tank' as const, label: tank, detail: 'Raw material tank' },
    { id: 'reactor', stage: 'reactor' as const, label: reactor, detail: `Continuous reactor · ${qty} t` },
    ...trucks.map(([plate], i) => ({ id: `t${i}`, stage: 'truck' as const, label: plate, detail: `MB3-2610-${4410 + i * 9}` })),
    ...trucks.map(([, customer], i) => ({ id: `c${i}`, stage: 'customer' as const, label: customer, detail: 'Delivered' })),
  ]
  const links: Array<readonly [string, string]> = [
    ...vendors.map((_, i) => [`v${i}`, 'tank'] as const),
    ['tank', 'reactor'],
    ...trucks.map((_, i) => ['reactor', `t${i}`] as const),
    ...trucks.map((_, i) => [`t${i}`, `c${i}`] as const),
  ]
  return { id, product, produced, qty, state, nodes, links }
}

export const LOTS: readonly Lot[] = [
  lot('RSI-H2SO4-261028', 'Sulfuric acid 98%', '2026-10-28', 640, 'released', ['Aramco Trading · SUL-88213', 'Pertamina · SUL-40177'], 'T-104', [['B 9412 TRA', 'Rodame NPK Plant Gresik'], ['B 9208 TRA', 'PT Petrokimia Mitra'], ['L 8754 RT', 'PT Indo Detergent']]),
  lot('RSI-H3PO4-261026', 'Phosphoric acid 52%', '2026-10-26', 410, 'hold', ['OCP Morocco · PHA-20931'], 'T-102', [['L 8754 RT', 'Rodame NPK Plant Gresik'], ['L 8671 RT', 'PT Nusantara Feed']]),
  lot('RSI-NH3-261021', 'Ammonia solution', '2026-10-21', 280, 'recalled', ['Pupuk Kaltim · AMM-7740', 'Pupuk Kaltim · AMM-7741'], 'T-101', [['B 9037 TRA', 'Rodame Urea Plant Palembang'], ['B 9550 TRA', 'PT Textile Prima']]),
  lot('RSI-OLM-261019', 'Oleum 20%', '2026-10-19', 190, 'released', ['In-house · SAP-2610-19'], 'T-106', [['B 9412 TRA', 'PT Kimia Farma Plant'], ['B 9208 TRA', 'PT Unggul Polymer']]),
]

const wave = (base: number, amp: number, seed: number) => Array.from({ length: 12 }, (_, i) => Math.round(base + amp * Math.sin(i / 1.7 + seed)))

export const INTEGRATION: readonly IntegrationComponent[] = [
  { id: 'kafka', name: 'Apache Kafka / RabbitMQ', role: 'Event bus', scope: 'Central event bus for real-time, asynchronous transaction exchange between subsidiaries, such as sales orders from manufacturing to logistics.', team: 'IT Infrastructure / DevOps', users: 'System integrators and software developers', throughput: wave(4_200, 900, 0), unit: 'msg/s', uptime: 0.9998 },
  { id: 'debezium', name: 'Debezium CDC + PostgreSQL', role: 'Change data capture', scope: 'CDC pipeline that records changes in the operational databases and ships them to the warehouse without loading the ERP.', team: 'Database Administrator (DBA)', users: 'DBAs and data engineers', throughput: wave(1_350, 300, 1), unit: 'rows/s', uptime: 0.9995 },
  { id: 'clickhouse', name: 'ClickHouse Data Warehouse', role: 'Warehouse', scope: 'Storage and processing of large historical data for cross-holding analytics, BI dashboards and predictive models.', team: 'Data & Analytics', users: 'Data analysts and BI developers', throughput: wave(220, 80, 2), unit: 'queries/min', uptime: 0.9991 },
  { id: 'keycloak', name: 'Keycloak IAM (SSO/OIDC)', role: 'Identity', scope: 'Central single sign-on and role- and attribute-based access control (RBAC and ABAC) for every group employee.', team: 'IT Security & Infrastructure', users: 'Every group employee', throughput: wave(38, 14, 3), unit: 'logins/min', uptime: 0.9999 },
  { id: 'kong', name: 'Kong API Gateway', role: 'API gateway', scope: 'API traffic management, security throttling, rate limiting and API documentation between microservices.', team: 'IT Backend Engineering', users: 'Software engineers and external vendors', throughput: wave(2_900, 600, 4), unit: 'req/s', uptime: 0.9997 },
]

export const ALERTS: readonly Alert[] = [
  { id: 'a1', tone: 'danger', title: 'B 9037 TRA over speed', detail: '91 km/h with liquid ammonia near Bakauheni', to: '/fleet?truck=tk-03' },
  { id: 'a3', tone: 'warning', title: 'B 9550 TRA tank temperature', detail: 'Caustic soda at 47 °C, limit 45 °C', to: '/fleet?truck=tk-07' },
  { id: 'a4', tone: 'warning', title: 'Sulawesi Selatan quota at 89%', detail: 'Subsidised allocation runs out in about 3 weeks', to: '/distribution?region=sulsel' },
]
