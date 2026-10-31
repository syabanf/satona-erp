/** Seed rows for the record types that close the Satona scope gap analysis. */
import { round1 as round } from '@/domain/catalog/kit'
import type { Values } from '@/domain/records'
import type { Make } from './seeds'

const ENTITIES = ['holding', 'rotama', 'rodame', 'roasi']
const id = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(4, '0')}`
const month = (offset: number) => {
  const d = new Date(Date.UTC(2026, 9 + offset, 1))
  return d.toISOString().slice(0, 7)
}

/** Group chart of accounts: [code, name, class]. Local accounts map to these by name. */
const GROUP_COA: ReadonlyArray<[string, string, string]> = [
  ['G1100', 'Cash in bank', 'Asset'],
  ['G1200', 'Trade receivables', 'Asset'],
  ['G1300', 'Raw material inventory', 'Asset'],
  ['G1500', 'Plant & machinery', 'Asset'],
  ['G1900', 'Intercompany receivable', 'Asset'],
  ['G2100', 'Trade payables', 'Liability'],
  ['G2200', 'Accrued expenses', 'Liability'],
  ['G2500', 'Bank loan', 'Liability'],
  ['G2900', 'Intercompany payable', 'Liability'],
  ['G3100', 'Share capital', 'Equity'],
  ['G3200', 'Retained earnings', 'Equity'],
  ['G3900', 'Translation reserve (CTA)', 'Equity'],
  ['G4100', 'Fertiliser sales', 'Revenue'],
  ['G4200', 'Chemical sales', 'Revenue'],
  ['G4300', 'Freight revenue', 'Revenue'],
  ['G4900', 'Intercompany freight', 'Revenue'],
  ['G5100', 'Raw material cost', 'Expense'],
  ['G5200', 'Fuel', 'Expense'],
  ['G5300', 'Maintenance', 'Expense'],
  ['G5400', 'Salaries', 'Expense'],
  ['G5500', 'Depreciation', 'Expense'],
  ['G5900', 'FX gain or loss', 'Expense'],
]
export const groupAccountFor = (name: unknown) => id('GCOA', Math.max(0, GROUP_COA.findIndex(([, n]) => n === name)))

/** Hazard data per material code: UN number, CAS, packing group, signal word. */
export const MATERIAL_HAZARDS: Record<string, Values> = {
  'RM-AMM': { unNumber: 'UN1005', cas: '7664-41-7', packingGroup: 'None', signalWord: 'Danger' },
  'RM-PHA': { unNumber: 'UN1805', cas: '7664-38-2', packingGroup: 'III', signalWord: 'Danger' },
  'RM-SUL': { unNumber: 'UN2448', cas: '7704-34-9', packingGroup: 'III', signalWord: 'Warning' },
  'RM-H2SO4': { unNumber: 'UN1830', cas: '7664-93-9', packingGroup: 'II', signalWord: 'Danger' },
  'RM-NAOH': { unNumber: 'UN1824', cas: '1310-73-2', packingGroup: 'II', signalWord: 'Danger' },
}

const CAMPAIGNS = ['Acid plant run 41', 'Acid plant run 42', 'Oleum campaign Q4', 'SAP-2 post turnaround', 'Ammonia storage turnover', 'Acid plant run 43', 'Caustic dilution run', 'SAP-1 catalyst end-of-life', 'Acid plant run 44', 'Oleum campaign Q3']

export const SCOPE_SEEDS: Record<string, { count: number; make: Make }> = {
  'mdm.groupcoa': {
    count: GROUP_COA.length,
    make: ({ i }) => {
      const [code, name, cls] = GROUP_COA[i]!
      return { code, name, class: cls, statement: ['Asset', 'Liability', 'Equity'].includes(cls) ? 'Balance sheet' : 'Profit and loss', locked: i % 7 === 6 ? 'No' : 'Yes' }
    },
  },
  'vms.criteria': {
    count: 3,
    make: ({ i }) =>
      ([
        { name: 'Quality', weight: 40, measure: 'Lots accepted at incoming inspection over lots received.' },
        { name: 'On-time delivery', weight: 35, measure: 'Receipts on or before the PO delivery date.' },
        { name: 'Price competitiveness', weight: 25, measure: 'Quoted price against the best quote in the same RFQ.' },
      ] as const)[i]!,
  },
  'vms.avl': {
    count: 10,
    make: ({ i, day, ref }) => ({
      vendor: id('BP', i % 5),
      category: ['Raw material', 'Raw material', 'Chemicals', 'Chemicals', 'Freight', 'Spare parts', 'Services', 'Raw material', 'Chemicals', 'Spare parts'][i]!,
      standing: i === 3 ? 'Blacklisted' : i % 4 === 2 ? 'Conditional' : 'Approved',
      rating: ref('vms.ratings'),
      validTo: day(20, 400),
      reason: i === 3 ? 'Two off-spec acid lots in Q2 and a late SDS update.' : i % 4 === 2 ? 'Approved pending ISO 9001 renewal.' : 'Passed the annual vendor evaluation.',
    }),
  },
  'tms.geofences': {
    count: 10,
    make: ({ i, ref }) => {
      const [name, kind, radius, speedLimit, lat, lng] = ([
        ['Roasi Cilegon plant gate', 'Plant', 400, 20, -5.97, 106.01],
        ['Rodame Gresik plant gate', 'Plant', 500, 20, -7.1554, 112.6337],
        ['Cikampek depot', 'Plant', 300, 20, -6.419, 107.456],
        ['PT Petrokimia Mitra unloading', 'Customer site', 250, 15, -7.16, 112.65],
        ['PT Indo Detergent receiving', 'Customer site', 200, 15, -7.29, 112.73],
        ['Rest area KM 57 Cikampek', 'Rest area', 350, 40, -6.37, 107.33],
        ['Rest area KM 166 Cipali', 'Rest area', 350, 40, -6.56, 108.06],
        ['Merak port, no-stop', 'No-stop zone', 800, 30, -5.93, 105.99],
        ['Semarang city ring, school zone', 'Speed zone', 1500, 40, -6.99, 110.42],
        ['Bakauheni ferry queue', 'No-stop zone', 600, 10, -5.87, 105.75],
      ] as const)[i]!
      return { name, kind, radius, speedLimit, lat, lng, location: ref('tms.locations') }
    },
  },
  'qc.methods': {
    count: 8,
    make: ({ i, ref }) => {
      const [parameter, method, instrument, duration] = ([
        ['Total nitrogen (N)', 'SNI 2803:2012 Kjeldahl', 'Kjeltec 8400 analyser', 90],
        ['Phosphate (P₂O₅)', 'SNI 2803:2012 spectrophotometry', 'UV-Vis spectrophotometer', 60],
        ['Potash (K₂O)', 'SNI 2803:2012 flame photometry', 'Flame photometer', 45],
        ['Moisture', 'SNI 2803:2012 gravimetric oven', 'Moisture oven 105 °C', 120],
        ['Granule size 2-4 mm', 'Sieve analysis', 'Sieve shaker', 20],
        ['Ammonia assay', 'ASTM E291 titration', 'Auto titrator', 30],
        ['H₂SO₄ concentration', 'ISO 910 titration', 'Auto titrator', 25],
        ['Effluent pH', 'SNI 6989.11:2019', 'pH meter', 10],
      ] as const)[i]!
      return { parameter, method, instrument, duration, calibration: ref('eam.calibrations') }
    },
  },
  'inv.reorder': {
    count: 10,
    make: ({ i, int, ref }) => {
      const dailyUse = int(4, 60)
      const leadTime = int(5, 35)
      const safety = int(20, 300)
      const rop = dailyUse * leadTime + safety
      return { material: id('MAT', i % 6), plant: ref('mdm.plants'), dailyUse, leadTime, safety, onHand: i % 3 === 0 ? Math.round(rop * 0.8) : Math.round(rop * (1.2 + (i % 4) * 0.3)), trigger: i % 2 ? 'Notify procurement' : 'Auto PR' }
    },
  },
  'sys.topics': {
    count: 10,
    make: ({ i }) => {
      const [topic, producer, consumers, broker, lag, dlq] = ([
        ['tms.trip.dispatched', 'TMS', 'FBL, HAZ, OCC', 'Kafka', 0, 0],
        ['tms.telemetry.reading', 'IoT gateway', 'TMS, OCC, ClickHouse', 'Kafka', 412, 0],
        ['vms.po.released', 'VMS', 'INV, FIN, Vendor portal', 'Kafka', 0, 0],
        ['epm.ic.entry.created', 'FIN', 'EPM, FBL', 'Kafka', 3, 0],
        ['gtr.lot.released', 'QC', 'GTR, DMS, WMS', 'Kafka', 0, 0],
        ['tfm.level.changed', 'Tank gauges', 'TFM, INV, OCC', 'Kafka', 1280, 2],
        ['occ.alarm.raised', 'OCC', 'SHE, EAM, Notifications', 'RabbitMQ', 0, 0],
        ['she.permit.approved', 'SHE', 'OCC, Notifications', 'RabbitMQ', 0, 0],
        ['hrs.payroll.posted', 'HRS', 'FIN', 'RabbitMQ', 0, 1],
        ['dms.quota.consumed', 'DMS', 'EPM, BI', 'Kafka', 18, 0],
      ] as const)[i]!
      return { topic, producer, consumers, broker, lag, dlq, version: 1 + (i % 3) }
    },
  },
  'sys.connectors': {
    count: 8,
    make: ({ i }) => {
      const [name, source, lag, rows] = ([
        ['tms-trips', 'tms.trips', 2, 1_400],
        ['tms-telemetry', 'tms.telemetry', 4, 2_100_000],
        ['fin-journals', 'fin.journal_lines', 3, 48_000],
        ['inv-movements', 'inv.stock_movements', 2, 36_000],
        ['qc-results', 'qc.sample_results', 1, 3_200],
        ['tfm-gauges', 'tfm.gauge_readings', 6, 860_000],
        ['dms-orders', 'dms.orders', 2, 5_400],
        ['hrs-attendance', 'hrs.attendance', 9, 2_600],
      ] as const)[i]!
      return { name: `debezium-${name}`, source: `public.${source}`, sink: i === 7 ? 'S3 archive' : 'ClickHouse', lag, rows }
    },
  },
  'sys.apis': {
    count: 8,
    make: ({ i, day }) => {
      const [route, consumer, quota, p95, errors] = ([
        ['/v1/telematics/positions', 'GPS vendor (Cartrack)', 6000, 38, 0.1],
        ['/v1/iot/tank-readings', 'IoT gateway', 12000, 22, 0],
        ['/v1/dms/orders', 'Distributor mobile app', 600, 140, 0.4],
        ['/v1/vendor/quotations', 'Vendor portal', 300, 180, 0.2],
        ['/v1/tax/efaktur', 'DJP e-Faktur host-to-host', 120, 610, 1.8],
        ['/v1/regulator/festronik', 'KLHK Festronik', 60, 920, 2.4],
        ['/v1/lims/results', 'LIMS bench software', 900, 55, 0],
        ['/v1/bank/payroll', 'Bank Mandiri H2H', 30, 380, 0],
      ] as const)[i]!
      return { route, consumer, quota, p95, errors, version: i === 4 ? 'v1 (v2 in beta)' : 'v1', keyExpiry: day(-10, 200) }
    },
  },
  'sys.idp': {
    count: 4,
    make: ({ i }) =>
      ([
        { name: 'Satona employees', protocol: 'OIDC', mfa: 'Required', realm: 'satona', users: 2562 },
        { name: 'Corporate Active Directory', protocol: 'LDAP / AD', mfa: 'Required', realm: 'satona', users: 2410 },
        { name: 'Vendor portal', protocol: 'OIDC', mfa: 'Optional', realm: 'vendors', users: 312 },
        { name: 'Distributors and kiosks', protocol: 'OIDC', mfa: 'Optional', realm: 'partners', users: 1840 },
      ] as const)[i]!,
  },

  'mdm.changes': {
    count: 12,
    make: ({ i, ref }) => {
      const [subject, object, change] = ([
        ['Merge "Pupuk Kaltim" and "PT Pupuk Kalimantan Timur"', 'Vendor', 'Merge duplicate'],
        ['New customer PT Agro Lestari Jaya', 'Customer', 'Create'],
        ['Update NPWP for Asahimas Chemical', 'Vendor', 'Update'],
        ['Block OCP Morocco pending audit', 'Vendor', 'Block'],
        ['New material Oleum 20%', 'Material', 'Create'],
        ['Merge two "PT Indo Detergent" records', 'Customer', 'Merge duplicate'],
        ['Update bank account Aramco Trading', 'Vendor', 'Update'],
        ['Change UN number on caustic soda', 'Material', 'Update'],
        ['New customer PT Sinar Tani', 'Customer', 'Create'],
        ['Update payment term PT Unggul Polymer', 'Customer', 'Update'],
        ['Merge kiosk records in Lamongan', 'Customer', 'Merge duplicate'],
        ['New vendor PT Katalis Nusantara', 'Vendor', 'Create'],
      ] as const)[i]!
      return { subject, object, change, partner: object === 'Material' ? '' : ref('mdm.partners'), duplicateOf: change === 'Merge duplicate' ? ref('mdm.partners') : '', distribute: i % 3 === 0 ? 'All entities' : ['Rotama', 'Rodame', 'Roasi'][i % 3]!, reason: 'Raised from the group master data hub.' }
    },
  },
  'epm.adjustments': {
    count: 14,
    make: ({ i, int, ref }) => {
      const [kind, description, debit, credit] = ([
        ['Intercompany elimination', 'Eliminate Rotama freight to Rodame', 15, 16],
        ['Intercompany elimination', 'Eliminate IC receivable and payable', 8, 4],
        ['Intercompany elimination', 'Eliminate acid sales Roasi to Rodame', 13, 16],
        ['Equity elimination', 'Eliminate investment in subsidiaries', 9, 10],
        ['Reclassification', 'Reclass freight accrual to payables', 6, 5],
        ['CTA', 'Translate USD balances of Roasi', 21, 11],
        ['Intercompany elimination', 'Eliminate shared service fee', 12, 19],
      ] as const)[i % 7]!
      return { consolidation: ref('epm.consolidations'), kind, description, debit: id('GCOA', debit), credit: id('GCOA', credit), amount: int(2, 30) * 1e9 }
    },
  },
  'epm.revaluations': {
    count: 12,
    make: ({ i, int }) => {
      const [currency, book, close] = ([
        ['USD', 15_820, 16_140],
        ['EUR', 17_210, 17_050],
        ['SGD', 11_790, 11_930],
        ['CNY', 2_190, 2_230],
      ] as const)[i % 4]!
      return { period: month(-1 - Math.floor(i / 4)), entity: ['roasi', 'rodame', 'holding', 'rotama'][i % 4]!, currency, exposure: int(2, 40) * 100_000 * (i % 5 === 4 ? -1 : 1), bookRate: book, closingRate: close - Math.floor(i / 4) * 20, kind: i % 4 === 2 ? 'Translation (CTA)' : i % 3 === 0 ? 'Realised' : 'Unrealised' }
    },
  },
  'epm.forecasts': {
    count: 16,
    make: ({ i, int }) => {
      const revenue = int(40, 220) * 1e9
      const scenario = (['Base', 'Upside', 'Downside', 'What-if'] as const)[i % 4]!
      return { period: month(1 + Math.floor(i / 8)), entity: ENTITIES[Math.floor(i / 4) % 4]!, scenario, revenue, cost: Math.round(revenue * (scenario === 'Downside' ? 0.9 : scenario === 'Upside' ? 0.76 : 0.83)) }
    },
  },
  'vms.demands': {
    count: 8,
    make: ({ i, int, ref }) => ({ material: id('MAT', i % 6), period: month(1 + Math.floor(i / 6)), rodame: int(400, 3200), roasi: int(100, 1800), rotama: i % 3 === 0 ? int(20, 120) : 0, contract: ref('vms.contracts') }),
  },
  'vms.rfqs': {
    count: 8,
    make: ({ i, int, day, ref }) => {
      const [title, mode] = ([
        ['Liquid ammonia Q1 2027 supply', 'Sealed tender'],
        ['Phosphoric acid 52% spot cargo', 'RFQ'],
        ['Molten sulfur annual contract', 'E-auction'],
        ['Caustic soda 48% for Roasi', 'RFQ'],
        ['Granulator spare rollers', 'RFQ'],
        ['Tank truck freight Sumatra lanes', 'E-auction'],
        ['V₂O₅ catalyst replacement', 'Sealed tender'],
        ['Jumbo bags 1 t, 200k pcs', 'E-auction'],
      ] as const)[i]!
      return { title, mode, material: id('MAT', i % 6), qty: int(50, 4000), closes: day(-30, 25), bids: int(2, 9), bestPrice: int(30, 140) * 100_000, winner: i % 2 ? ref('mdm.partners') : '' }
    },
  },
  'vms.quotations': {
    count: 18,
    make: ({ i, int, day }) => ({ title: `Offer ${i + 1}`, rfq: id('RFQ', i % 8), vendor: id('BP', i % 5), price: int(30, 150) * 100_000, leadTime: int(7, 60), validTo: day(5, 90), notes: i % 4 === 0 ? 'Price includes CIF Cilegon.' : '' }),
  },
  'vms.vendorinvoices': {
    count: 16,
    make: ({ i, int, day, ref }) => ({ invoiceNo: `INV/${['PKT', 'OCP', 'ART', 'ASC', 'PPN'][i % 5]}/${2600 + i * 3}`, order: ref('vms.orders'), vendor: id('BP', i % 5), amount: int(200, 9000) * 1e6, due: day(-20, 45) }),
  },
  'grc.reports': {
    count: 10,
    make: ({ i, int, day }) => {
      const [title, regulator, entity] = ([
        ['Semester B3 waste report', 'KLHK (SIMPEL)', 'roasi'],
        ['Stack emission CEMS quarterly', 'KLHK (SIMPEL)', 'roasi'],
        ['Wastewater discharge monthly', 'KLHK (SIMPEL)', 'rodame'],
        ['B3 transport permit renewal pack', 'Kemenhub', 'rotama'],
        ['P2K3 quarterly K3 report', 'Disnaker', 'holding'],
        ['Subsidised fertiliser realisation', 'BKPM (OSS)', 'rodame'],
        ['Hazardous goods fleet audit', 'Kemenhub', 'rotama'],
        ['RKL-RPL implementation report', 'KLHK (SIMPEL)', 'roasi'],
        ['Boiler and pressure vessel inspection', 'Disnaker', 'roasi'],
        ['Energy audit and usage report', 'ESDM', 'rodame'],
      ] as const)[i]!
      return { title, regulator, entity, period: month(-1 - (i % 3)), evidence: int(3, 40), signedBy: i % 3 ? 'Dian Prasetyo, SHE Manager' : '', due: day(-15, 40) }
    },
  },
  'she.audits': {
    count: 10,
    make: ({ i, int, day, ref }) => {
      const checklist = [64, 48, 120, 36, 80][i % 5]!
      return { title: `${['SMK3 surveillance', 'ISO 45001 internal', 'Tank farm walkdown', 'Contractor K3 audit', 'ISO 14001 internal'][i % 5]} ${i < 5 ? 'H2' : 'H1'} 2026`, area: ref('she.areas'), standard: (['SMK3 PP 50/2012', 'ISO 45001', 'Internal', 'Internal', 'ISO 14001'] as const)[i % 5], auditor: ['Rina Hapsari', 'Tommy Siregar', 'Dian Prasetyo'][i % 3]!, date: day(-160, 30), checklist, passed: Math.round(checklist * (0.72 + int(0, 25) / 100)), findings: int(0, 9) }
    },
  },
  'tms.telemetry': {
    count: 30,
    make: ({ i, int, day, ref }) => {
      const hot = i % 9 === 4
      return { reading: `Reading ${String(i + 1).padStart(2, '0')}, ${String(6 + (i % 14)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, trip: ref('tms.trips'), device: ref('tms.devices'), date: day(-6, 0), temperature: hot ? int(46, 52) : int(24, 40), pressure: hot ? 5.8 : round(1.4 + (i % 7) * 0.5), tempMax: 45, pressureMax: 5.5 }
    },
  },
  'wms.tasks': {
    count: 20,
    make: ({ i, ref }) => {
      const materialClass = (['Class 8 Corrosive', 'Non-B3', 'Class 4.1 Flammable solid', 'Class 2.3 Toxic gas', 'Class 8 Corrosive'] as const)[i % 5]
      const zoneClass = i % 7 === 3 ? 'Class 8 Corrosive' : i % 5 === 1 ? 'Non-B3' : materialClass
      const kind = i % 3 === 2 ? 'Picking' : 'Putaway'
      return { task: `${kind} ${String(i + 1).padStart(2, '0')}`, kind, lot: ref('wms.lots'), bin: ref('wms.bins'), rule: i % 4 === 3 ? 'FIFO' : 'FEFO', materialClass, zoneClass, scanned: i % 2 ? `SSCC 0899${String(41000 + i * 37)}` : '' }
    },
  },
  'bpf.moisture': {
    count: 14,
    make: ({ i, int, ref }) => ({ lot: `L-2610-${100 + i * 3}`, order: ref('bpf.orders'), wet: int(40, 220), moisture: round(1.6 + (i % 6) * 0.35), standard: 2.5, price: int(52, 78) * 100_000 }),
  },
  'mrp.planned': {
    count: 14,
    make: ({ i, int, day, ref }) => ({ material: id('MAT', i % 6), requirement: ref('mrp.requirements'), qty: int(200, 3000), leadTime: int(7, 40), safety: int(50, 400), release: day(-5, 30), requisition: i % 4 === 0 ? ref('vms.requisitions') : '' }),
  },
  'cfp.campaigns': {
    count: CAMPAIGNS.length,
    make: ({ i, int, day, ref }) => {
      const planned = int(1800, 6400)
      const loss = i % 3 === 0 ? 0.02 : 0.03 + (i % 4) * 0.025
      return { name: CAMPAIGNS[i]!, unit: ref('cfp.units'), start: day(-150, -5), end: '', planned, actual: Math.round(planned * (1 - loss)), standardYield: 97.5, lossCause: loss <= 0.02 ? 'None' : (['Catalyst ageing', 'Feed impurity', 'Unplanned trip', 'Off-spec recycle', 'Leak'] as const)[i % 5] }
    },
  },
  'cfp.coproducts': {
    count: 20,
    make: ({ i, int }) => {
      const [product, kind, share] = ([
        ['Sulfuric acid 98%', 'Main product', 78],
        ['HP steam export', 'Co-product', 14],
        ['Oleum 20%', 'Co-product', 6],
        ['Spent catalyst', 'By-product', 2],
      ] as const)[i % 4]!
      return { campaign: id('CMP', Math.floor(i / 4)), product, kind, share, qty: kind === 'Main product' ? int(1800, 5200) : int(40, 900), jointCost: (24 + Math.floor(i / 4) * 3) * 1e9 }
    },
  },
}
