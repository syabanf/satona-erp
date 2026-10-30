/** Seed from "Scope dan User Matrix ERP Satona": 4 entities, 18 modules, their departments and users. */
import type { Entity, EntityId, ErpModule, Role, ScopeItem, ScopeStatus } from '@/domain/erp'

const B = 1e9

/** Twelve months of revenue from a base and a gentle seasonal swing. */
const months = (base: number, swing: number, seed: number) =>
  Array.from({ length: 12 }, (_, i) => Math.round(base * (1 + swing * Math.sin((i + seed) / 1.9) + i * 0.012) * 1e8) / 1e8)

const ENTITY_SEED: ReadonlyArray<Omit<Entity, 'revenueYtd'>> = [
  {
    id: 'holding',
    name: 'PT Satona (Holding)',
    short: 'Satona Holding',
    sector: 'Group holding',
    slot: 2,
    headcount: 214,
    revenue: months(9.5 * B, 0.05, 1),
    kpis: [
      { label: 'Consolidated EBITDA margin', value: 18.4, unit: '%', delta: 0.021 },
      { label: 'Intercompany eliminations', value: 412, unit: 'entries', delta: -0.08 },
      { label: 'Open risk items', value: 17, unit: 'items', delta: -0.12 },
    ],
  },
  {
    id: 'rotama',
    name: 'PT Rotama Indonesia',
    short: 'Rotama',
    sector: 'Logistics',
    slot: 3,
    headcount: 486,
    revenue: months(31 * B, 0.08, 3),
    kpis: [
      { label: 'On-time delivery', value: 94.2, unit: '%', delta: 0.013 },
      { label: 'Tankers on road', value: 128, unit: 'units', delta: 0.04 },
      { label: 'Cost per km', value: 14_850, unit: 'Rp', delta: -0.021 },
    ],
  },
  {
    id: 'rodame',
    name: 'PT Rodame Indonesia',
    short: 'Rodame',
    sector: 'Fertiliser',
    slot: 4,
    headcount: 1_120,
    revenue: months(88 * B, 0.14, 5),
    kpis: [
      { label: 'NPK output this month', value: 41_300, unit: 't', delta: 0.062 },
      { label: 'Subsidy quota used', value: 71.8, unit: '%', delta: 0.044 },
      { label: 'Batch first-pass yield', value: 96.1, unit: '%', delta: 0.006 },
    ],
  },
  {
    id: 'roasi',
    name: 'PT Roasi Sinergi Industri',
    short: 'Roasi',
    sector: 'Chemicals',
    slot: 1,
    headcount: 742,
    revenue: months(64 * B, 0.1, 2),
    kpis: [
      { label: 'Reactor uptime', value: 98.7, unit: '%', delta: 0.004 },
      { label: 'Yield loss', value: 2.3, unit: '%', delta: -0.11 },
      { label: 'Stack emission vs limit', value: 61, unit: '%', delta: -0.05 },
    ],
  },
]

export const ENTITIES: readonly Entity[] = ENTITY_SEED.map((e) => ({ ...e, revenueYtd: e.revenue.slice(2).reduce((s, v) => s + v, 0) }))

type Seed = [title: string, status: ScopeStatus]

function scope(code: string, owner: string, items: readonly Seed[]): ScopeItem[] {
  return items.map(([title, status], i) => {
    const milestones = 4 + ((code.length + i) % 3)
    const done = status === 'live' ? milestones : status === 'build' ? Math.max(1, milestones - 2 - (i % 2)) : 0
    return { id: `${code}-${i + 1}`.toLowerCase(), title, status, owner, milestones, done }
  })
}

function mod(
  entity: EntityId,
  code: string,
  name: string,
  items: readonly Seed[],
  departments: string[],
  users: string[],
  kpis: ErpModule['kpis'],
  live?: ErpModule['live'],
): ErpModule {
  return { id: code.toLowerCase(), entity, code, name, scope: scope(code, users[0] ?? '', items), departments, users, kpis, live }
}

export const MODULES: readonly ErpModule[] = [
  mod('holding', 'MDM', 'Group Master Data Management', [
    ['Central chart of accounts (COA) standard', 'live'],
    ['Group customer and vendor master', 'live'],
    ['Material catalogue and B3 material codes', 'build'],
    ['Employee master data (HRIS foundation)', 'build'],
  ], ['Master Data Governance', 'Corporate Finance & Accounting', 'Corporate HR', 'IT Security'], ['HR / IT', 'Accounting Head', 'HR Manager'], [
    { label: 'Golden records', value: '48,210' },
    { label: 'Duplicates merged', value: '3,904' },
  ]),
  mod('holding', 'EPM', 'Financial Consolidation & EPM', [
    ['Automated monthly and yearly consolidation', 'live'],
    ['Intercompany elimination', 'build'],
    ['Multi-currency FX revaluation', 'build'],
    ['Group budgeting and forecasting', 'plan'],
  ], ['Corporate Finance & Accounting', 'Budgeting & Planning', 'Internal Audit'], ['CFO / Finance Director', 'Financial Controller', 'Corporate Accountant', 'Internal Auditor'], [
    { label: 'Close cycle', value: '4 days' },
    { label: 'Entities consolidated', value: '4 of 4' },
  ], { to: '/', label: 'Open group overview' }),
  mod('holding', 'VMS', 'Shared Procurement & Vendor Management', [
    ['Central sourcing of ammonia, phosphoric acid, sulfur', 'live'],
    ['Supplier rating and ranking', 'build'],
    ['B2B vendor procurement portal', 'build'],
  ], ['Group Procurement / SCM', 'Legal & Commercial'], ['Head of Procurement', 'Procurement Specialist', 'Vendor / Supplier (B2B Portal)'], [
    { label: 'Active vendors', value: '312' },
    { label: 'Spend under contract', value: '87%' },
  ]),
  mod('holding', 'GRC', 'Governance, Risk & Legal', [
    ['B3 permit tracking and licence renewal', 'live'],
    ['Regulatory audit trail and environmental compliance', 'build'],
    ['Holding EHS / K3 audits', 'plan'],
    ['Corporate risk matrix', 'build'],
  ], ['Legal & Compliance', 'Corporate EH&S / K3', 'Risk Management'], ['Legal Manager', 'EH&S Auditor', 'Risk Officer'], [
    { label: 'Permits expiring in 90 days', value: '6' },
    { label: 'Open findings', value: '23' },
  ]),
  mod('holding', 'BI', 'Enterprise Analytics & Executive BI', [
    ['Executive KPI rollup across subsidiaries', 'live'],
    ['Production, inventory turnover, sales and purchasing dashboards', 'build'],
    ['Group asset utilisation analytics', 'plan'],
  ], ['Board of Directors', 'Corporate Strategy / PMO'], ['Dewan Direksi Holding', 'Business Analyst', 'General Manager'], [
    { label: 'Dashboards live', value: '14' },
    { label: 'Weekly viewers', value: '96' },
  ], { to: '/', label: 'Open executive overview' }),

  mod('holding', 'OCC', 'Group Operations Command Centre', [
    ['Live unit status across all plants, depots and tank farms', 'build'],
    ['Alarm handling: acknowledge, assign, resolve, close with escalation matrix', 'build'],
    ['Data-source health for DCS, PLC, IoT, GPS and CCTV feeds', 'plan'],
    ['Energy and fuel monitoring per site', 'plan'],
    ['Capex project tracking', 'plan'],
  ], ['Corporate Operations', 'IT Infrastructure / OT'], ['Operations Director', 'Command Centre Operator', 'O&M Engineer'], [
    { label: 'Open alarms', value: '9' },
    { label: 'Sources connected', value: '21 of 24' },
  ], { to: '/occ', label: 'Open command centre' }),
  mod('rotama', 'TMS', 'Transportation Management & Telematics', [
    ['Tanker route optimisation', 'live'],
    ['GPS tracking and driver behaviour (speed)', 'live'],
    ['IoT telematics: tank temperature and pressure', 'live'],
  ], ['Fleet & Transport', 'Operational Logistics'], ['Fleet Manager', 'Transport Dispatcher / Planner', 'Driver (Driver App)'], [
    { label: 'Trips this month', value: '2,684' },
    { label: 'Overspeed events', value: '31' },
  ], { to: '/fleet', label: 'Open live fleet map' }),
  mod('rotama', 'WMS', 'Warehouse Management', [
    ['Chemical storage segregation by hazard class', 'live'],
    ['Lot / batch tracking with FEFO and FIFO rotation', 'build'],
  ], ['Warehouse & Inventory', 'Yard Operations'], ['Warehouse Manager', 'Kepala Gudang & Operator Stacker', 'Checker Gudang'], [
    { label: 'Pallet positions', value: '18,400' },
    { label: 'Pick accuracy', value: '99.4%' },
  ]),
  mod('rotama', 'HAZ', 'Dangerous Goods Transport & Compliance', [
    ['Automated B3 manifest (KLHK and Kemenhub)', 'live'],
    ['Driver dangerous-goods certificates and safety passports', 'live'],
  ], ['Health, Safety & Environment'], ['HSE Officer / K3 Specialist'], [
    { label: 'Manifests issued', value: '2,611' },
    { label: 'Certificates expiring', value: '9' },
  ], { to: '/fleet', label: 'See manifests on the fleet map' }),
  mod('rotama', 'FBL', 'Freight Billing & Intercompany Settlement', [
    ['Cost-plus freight rate calculation', 'live'],
    ['Internal freight invoices to Rodame and Roasi', 'build'],
    ['Logistics billing to external customers', 'build'],
  ], ['Logistics Finance & Invoicing', 'Commercial'], ['Billing Specialist', 'Finance & AR Officer'], [
    { label: 'Intercompany invoices', value: 'Rp 21,4 M' },
    { label: 'DSO', value: '38 days' },
  ]),

  mod('rodame', 'BPF', 'Batch Process & Formula Management', [
    ['Flexible NPK / urea recipe adjustment', 'live'],
    ['Automatic grade moisture adjustment', 'build'],
    ['Batch production orders', 'live'],
  ], ['Production & Processing', 'R&D Formulator'], ['Production Manager', 'Plant Supervisor', 'Formulator R&D'], [
    { label: 'Active formulas', value: '42' },
    { label: 'Batches this week', value: '186' },
  ]),
  mod('rodame', 'MRP', 'Manufacturing Resource Planning & Scheduling', [
    ['Bulk raw material requirement planning', 'build'],
    ['Granulator, dryer and mixer scheduling', 'build'],
    ['Capacity requirement planning', 'plan'],
  ], ['PPIC', 'Plant Procurement'], ['PPIC Manager / Planner', 'Plant Buyer'], [
    { label: 'Schedule adherence', value: '91%' },
    { label: 'Raw cover', value: '17 days' },
  ]),
  mod('rodame', 'QC', 'Quality Control & LIMS Integration', [
    ['Lab testing of N, P, K and moisture', 'live'],
    ['Certificate of Analysis (CoA)', 'live'],
    ['Rejection and re-processing workflow', 'live'],
  ], ['Quality Control', 'Laboratory (LIMS)'], ['QC Manager', 'Laboratory Analyst', 'QC Inspector'], [
    { label: 'Samples today', value: '312' },
    { label: 'Rejection rate', value: '1.8%' },
  ]),
  mod('rodame', 'EAM', 'Enterprise Asset Management (CMMS)', [
    ['Predictive and preventive maintenance of heavy machinery', 'build'],
    ['Granulator dryer maintenance and spare parts', 'build'],
    ['Scale and gauge calibration tracking', 'plan'],
  ], ['Plant Maintenance / Engineering', 'Spare Part Warehouse'], ['Maintenance Head', 'Machine Technician / Mechanic', 'Spare Parts Admin'], [
    { label: 'MTBF granulator', value: '412 h' },
    { label: 'Open work orders', value: '58' },
  ], { to: '/eam/reliability', label: 'Open reliability cockpit' }),
  mod('rodame', 'MES', 'Manufacturing Execution (MES)', [
    ['Shop-floor work orders per operation, released from batch orders', 'build'],
    ['OEE per work centre and shift (availability × performance × quality)', 'build'],
    ['Downtime capture with reason codes', 'live'],
    ['Quality holds and non-conformance reports', 'plan'],
  ], ['Production & Processing', 'Quality Control'], ['Shift Supervisor', 'Plant Operator', 'Process Engineer'], [
    { label: 'OEE this week', value: '78%' },
    { label: 'Downtime today', value: '96 min' },
  ], { to: '/mes/cockpit', label: 'Open production cockpit' }),
  mod('rodame', 'DMS', 'Distributor Management', [
    ['Subsidised and commercial quota allocation', 'live'],
    ['Regional distributor and kiosk network', 'live'],
    ['Distributor mobile order app', 'build'],
  ], ['Sales & Marketing', 'Commercial Distribution'], ['Commercial Director', 'Area Sales Manager', 'Distributor'], [
    { label: 'Distributors', value: '168' },
    { label: 'Kiosks', value: '4,920' },
  ], { to: '/distribution', label: 'Open distribution map' }),

  mod('roasi', 'CFP', 'Continuous Flow Process', [
    ['24/7 continuous reactor tracking', 'live'],
    ['By-product and co-product accounting', 'build'],
    ['Yield loss analysis and waste management', 'build'],
  ], ['Continuous Production', 'Process Engineering', 'Cost Accounting'], ['Plant Manager', 'Process Engineer', 'Cost Accountant'], [
    { label: 'Throughput', value: '1,140 t/day' },
    { label: 'Yield loss', value: '2.3%' },
  ]),
  mod('roasi', 'EHS', 'EHS & Chemical Safety (MSDS/GHS)', [
    ['Automated MSDS / SDS generation', 'live'],
    ['Plant chemical hazard matrix', 'build'],
    ['Stack emission and wastewater monitoring', 'build'],
  ], ['Health, Safety & Environment', 'K3 Lab'], ['EHS Manager', 'K3 Officer', 'Environmental Specialist'], [
    { label: 'SDS published', value: '264' },
    { label: 'Days without LTI', value: '418' },
  ]),
  mod('roasi', 'TFM', 'Tank Farm & Bulk Storage', [
    ['IoT dip level gauges on storage tanks', 'live'],
    ['Real-time liquid and gas stock reconciliation', 'build'],
    ['Auto-reorder point trigger', 'build'],
  ], ['Bulk Storage / Tank Farm', 'Supply Chain'], ['Tank Farm Supervisor', 'Material Controller'], [
    { label: 'Tanks online', value: '6 of 6' },
    { label: 'Stock variance', value: '0.4%' },
  ], { to: '/tank-farm', label: 'Open tank farm' }),
  mod('roasi', 'GTR', 'End-to-End Genealogy & Recalls', [
    ['Full batch genealogy: vendor lot to reactor to truck to customer', 'build'],
    ['Rapid recall on contamination', 'plan'],
  ], ['Quality Assurance', 'Supply Chain & Legal'], ['QA Manager', 'Recall Task Force / Crisis Team'], [
    { label: 'Lots traced', value: '1,284' },
    { label: 'Mock recall time', value: '42 min' },
  ], { to: '/traceability', label: 'Open genealogy' }),
]

const EXTERNAL = /vendor|supplier|distributor|driver|plant operator/i
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** One role per module user, seated in the module's first department. */
export const ROLES: readonly Role[] = MODULES.flatMap((m) =>
  m.users.map((name, i) => ({
    id: `${m.id}-${slug(name)}`,
    name,
    entity: m.entity,
    module: m.id,
    department: m.departments[Math.min(i, m.departments.length - 1)] ?? '',
    seats: EXTERNAL.test(name) ? 40 + ((name.length * 7) % 160) : 1 + ((name.length * 3 + i) % 9),
    external: EXTERNAL.test(name),
  })),
)
