/** Deterministic seed rows for every record type, relative to "today" so dates always look current. */
import { RECORD_TYPES } from '@/domain/catalog'
import { PROVINCES } from '@/domain/catalog/kit'
import { QUOTE_PRODUCTS, QUOTE_SERVICES } from '@/domain/catalog/rotama'
import { computeValues, type ErpRecord, type RecordType, type Values } from '@/domain/records'
import { DISTRIBUTORS, LOTS, SITES, TANKS, TRUCKS } from './ops'
import { MATERIAL_HAZARDS, SCOPE_SEEDS, groupAccountFor } from './seedsScope'
import { SUPPORT_SEEDS } from './seedsSupport'

export interface Ctx {
  i: number
  r: () => number
  pick: <T>(xs: readonly T[]) => T
  int: (min: number, max: number) => number
  /** A date `from` to `to` days around today. */
  day: (from: number, to: number) => string
  ref: (type: string) => string
}

export type Make = (c: Ctx) => Values
const ENTITIES = ['holding', 'rotama', 'rodame', 'roasi']
const DRIVERS = TRUCKS.map((t) => t.driver)
const LANES = ['Cilegon → Cikampek', 'Gresik → Malang', 'Cilegon → Bandar Lampung', 'Gresik → Semarang', 'Cikampek → Semarang', 'Palembang → Bandar Lampung', 'Jakarta → Bandung', 'Surabaya → Banyuwangi']
const MATERIALS: ReadonlyArray<[string, string, string]> = [
  ['RM-AMM', 'Liquid ammonia', 'Class 2.3 Toxic gas'],
  ['RM-PHA', 'Phosphoric acid 52%', 'Class 8 Corrosive'],
  ['RM-SUL', 'Molten sulfur', 'Class 4.1 Flammable solid'],
  ['RM-H2SO4', 'Sulfuric acid 98%', 'Class 8 Corrosive'],
  ['RM-NAOH', 'Caustic soda 48%', 'Class 8 Corrosive'],
  ['RM-KCL', 'Potassium chloride', 'Non-B3'],
  ['FG-UREA', 'Urea granular', 'Non-B3'],
  ['FG-NPK15', 'NPK 15-15-15', 'Non-B3'],
  ['FG-NPK16', 'NPK 16-16-16', 'Non-B3'],
  ['FG-ZA', 'Ammonium sulfate (ZA)', 'Non-B3'],
]
const PARTNERS: ReadonlyArray<[string, string, string]> = [
  ['Pupuk Kaltim', 'Vendor', 'Bontang'],
  ['OCP Morocco', 'Vendor', 'Casablanca'],
  ['Aramco Trading', 'Vendor', 'Singapore'],
  ['Asahimas Chemical', 'Vendor', 'Cilegon'],
  ['Pertamina Patra Niaga', 'Vendor', 'Jakarta'],
  ['PT Petrokimia Mitra', 'Customer', 'Gresik'],
  ['PT Indo Detergent', 'Customer', 'Surabaya'],
  ['PT Kimia Farma Plant', 'Customer', 'Bandung'],
  ['PT Unggul Polymer', 'Customer', 'Cilegon'],
  ['PT Rodame Indonesia', 'Intercompany', 'Gresik'],
  ['PT Roasi Sinergi Industri', 'Intercompany', 'Cilegon'],
  ['PT Rotama Indonesia', 'Intercompany', 'Jakarta'],
]
const FORMULAS: ReadonlyArray<[string, number, number, number]> = [
  ['Urea 46', 46, 0, 0],
  ['NPK 15-15-15', 15, 15, 15],
  ['NPK 16-16-16', 16, 16, 16],
  ['NPK 12-12-17', 12, 12, 17],
  ['ZA 21', 21, 0, 0],
  ['NPK 20-10-10', 20, 10, 10],
]

const QUOTES = 24
const seedId = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(4, '0')}`
/** The lines of seeded quotation `q`; its subtotal is their sum, so the demo totals add up. */
function quoteLines(q: number) {
  return Array.from({ length: 1 + (q % 3) }, (_, k) => {
    const { item, unit, price } = QUOTE_PRODUCTS[(q + k * 2) % QUOTE_PRODUCTS.length]!
    return { quotation: seedId('QTN', q), item, unit, price, qty: unit === 'trip' ? 2 + ((q * 3 + k) % 9) : 1 + ((q + k) % 3) }
  })
}
const QUOTE_LINES = Array.from({ length: QUOTES }, (_, q) => quoteLines(q)).flat()

const SEEDS: Record<string, { count: number; make: Make }> = {
  ...SUPPORT_SEEDS,
  ...SCOPE_SEEDS,
  'tms.p2h': {
    count: 16,
    make: ({ i }) => {
      const [item, category, critical] = ([
        ['Tyre tread and pressure', 'Tyres & wheels', 'Yes'],
        ['Wheel nuts tight, no cracks', 'Tyres & wheels', 'Yes'],
        ['Service brake test', 'Brakes', 'Yes'],
        ['Parking brake holds on slope', 'Brakes', 'Yes'],
        ['Air pressure builds within 3 min', 'Brakes', 'Yes'],
        ['Head, brake and hazard lights', 'Lights & horn', 'Yes'],
        ['Horn and reverse alarm', 'Lights & horn', 'No'],
        ['Tank manhole and seals intact', 'Tank, valves & hoses', 'Yes'],
        ['Bottom valves closed, no drips', 'Tank, valves & hoses', 'Yes'],
        ['Hoses and couplings capped', 'Tank, valves & hoses', 'No'],
        ['Fire extinguisher charged', 'Safety equipment', 'Yes'],
        ['Spill kit and wheel chocks', 'Safety equipment', 'Yes'],
        ['B3 placards and UN panels fitted', 'Safety equipment', 'Yes'],
        ['PPE for driver (goggles, gloves)', 'Safety equipment', 'No'],
        ['B3 manifest and SDS on board', 'Documents', 'Yes'],
        ['STNK, KIR and driver SIM valid', 'Documents', 'Yes'],
      ] as const)[i]!
      return { item, category, critical }
    },
  },
  'tms.devices': {
    count: 28,
    make: ({ i, int }) => ({ vehicle: `VEH-${String((i % 14) + 1).padStart(4, '0')}`, kind: i < 14 ? 'ADAS front camera' : 'DSM cabin camera', serial: `${i < 14 ? 'ADS' : 'DSM'}-${int(100000, 999999)}`, firmware: `v${int(3, 4)}.${int(0, 9)}.${int(0, 20)}` }),
  },
  'tms.checkins': {
    count: 70,
    make: ({ pick, int, day, ref }) => {
      const total = 16
      const fail = pick([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
      return { kind: pick(['Pre-trip P2H', 'Pre-trip P2H', 'Gate in', 'Gate out']), vehicle: ref('tms.vehicles'), driver: ref('tms.drivers'), location: `LOC-000${pick([1, 2, 3, 4, 5, 7])}`, date: day(-20, 0), time: `${String(int(4, 21)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`, odometer: int(40, 380) * 1000, alcohol: pick(['Negative', 'Negative', 'Negative', 'Negative', 'Negative', 'Negative', 'Negative', 'Negative', 'Negative', 'Positive']), fatigue: int(0, 9) === 0 ? int(62, 78) : int(8, 55), passed: total - fail, total, seal: `SL-${int(100000, 999999)}` }
    },
  },
  'tms.safety': {
    count: 140,
    make: ({ pick, int, day, ref }) => {
      const event = pick(['Forward collision warning', 'Lane departure', 'Lane departure', 'Headway too close', 'Headway too close', 'Over speed', 'Pedestrian warning', 'Drowsiness', 'Drowsiness', 'Distraction', 'Distraction', 'Phone use', 'Smoking', 'No seatbelt', 'Camera covered'])
      const night = /Drowsi/.test(event)
      return { event, vehicle: ref('tms.vehicles'), driver: ref('tms.drivers'), severity: pick(['Low', 'Medium', 'Medium', 'High', 'Critical']), speed: int(35, 96), date: day(-29, 0), hour: night ? pick([0, 1, 2, 3, 4, 5, 22, 23]) : int(5, 21), place: pick(['Tol Jakarta-Merak KM 42', 'Tol Cikampek KM 70', 'Pantura Tuban', 'Tol Surabaya-Malang KM 18', 'Bakauheni port road', 'Lintas Sumatera Kayu Agung', 'Tol Cipularang KM 92']), coaching: '' }
    },
  },

  'occ.units': {
    count: 16,
    make: ({ i, int }) => {
      const [tag, name, plant, kind] = ([
        ['RS-R101', 'Sulfur burner R-101', 9, 'Reactor'],
        ['RS-C102', 'SO₂ converter C-102', 9, 'Reactor'],
        ['RS-R201', 'Phosphoric reactor R-201', 9, 'Reactor'],
        ['RS-B01', 'Waste heat boiler B-01', 9, 'Boiler'],
        ['RD-G1', 'Granulator G-1 Gresik', 6, 'Granulator'],
        ['RD-G2', 'Granulator G-2 Gresik', 6, 'Granulator'],
        ['RD-D1', 'Rotary dryer D-1 Gresik', 6, 'Dryer'],
        ['RD-U1', 'Urea synthesis Palembang', 7, 'Reactor'],
        ['RD-B1', 'Steam boiler Palembang', 7, 'Boiler'],
        ['TF-101', 'Tank T-101 ammonia', 10, 'Tank'],
        ['TF-102', 'Tank T-102 phosphoric acid', 10, 'Tank'],
        ['TF-103', 'Tank T-103 sulfuric acid', 10, 'Tank'],
        ['RT-FLT-W', 'Tanker fleet west', 2, 'Tanker fleet'],
        ['RT-FLT-E', 'Tanker fleet east', 4, 'Tanker fleet'],
        ['PW-GRS', '20 kV feeder Gresik', 6, 'Power feeder'],
        ['PW-CLG', '150 kV feeder Cilegon', 9, 'Power feeder'],
      ] as const)[i]!
      return { tag, name, site: `PLT-${String(plant).padStart(4, '0')}`, kind, load: int(55, 102), runHours: int(4000, 52000) }
    },
  },
  'occ.register': {
    count: 12,
    make: ({ i }) => {
      const [code, name, kind, priority, threshold] = ([
        ['ALM-TRIP', 'Equipment trip', 'Equipment trip', 'Critical', 'Run signal lost while load > 0'],
        ['ALM-HTEMP', 'High process temperature', 'Process', 'High', 'Temperature above high-high setpoint'],
        ['ALM-LPRES', 'Low pressure', 'Process', 'High', 'Pressure below low setpoint for 30 s'],
        ['ALM-SO2', 'Stack SO₂ above 90% of limit', 'Environment', 'High', 'SO₂ > 720 mg/Nm³ for 15 min'],
        ['ALM-NH3', 'Ammonia leak detected', 'Safety', 'Critical', 'NH₃ detector > 25 ppm'],
        ['ALM-FIRE', 'Fire or smoke detected', 'Safety', 'Critical', 'Detector or CCTV analytics alarm'],
        ['ALM-LTANK', 'Low tank level', 'Inventory', 'Medium', 'Level below reorder point'],
        ['ALM-HTANK', 'High tank level', 'Inventory', 'High', 'Level above 95%'],
        ['ALM-COMMS', 'Communication loss', 'Communication', 'Medium', 'No data for 5 min'],
        ['ALM-SPEED', 'Tanker over speed', 'Safety', 'High', 'Speed > 80 km/h with B3 load'],
        ['ALM-VIB', 'High vibration', 'Equipment trip', 'Medium', 'Vibration > 7.1 mm/s'],
        ['ALM-PWR', 'Power dip', 'Equipment trip', 'High', 'Voltage < 90% for 200 ms'],
      ] as const)[i]!
      return { code, name, kind, priority, threshold }
    },
  },
  'occ.escalation': {
    count: 10,
    make: ({ i }) => {
      const [priority, level, role, within, channel] = ([
        ['Critical', '1 · Site O&M', 'Shift supervisor', 2, 'Phone call'],
        ['Critical', '2 · Command centre', 'Command Centre Operator', 5, 'WhatsApp'],
        ['Critical', '3 · Management', 'Operations Director', 15, 'Phone call'],
        ['High', '1 · Site O&M', 'Shift supervisor', 10, 'WhatsApp'],
        ['High', '2 · Command centre', 'Command Centre Operator', 30, 'In-app'],
        ['High', '3 · Management', 'Plant Manager', 60, 'Email'],
        ['Medium', '1 · Site O&M', 'Area technician', 30, 'In-app'],
        ['Medium', '2 · Command centre', 'O&M Engineer', 120, 'In-app'],
        ['Low', '1 · Site O&M', 'Area technician', 240, 'In-app'],
        ['Low', '2 · Command centre', 'O&M Engineer', 1440, 'Email'],
      ] as const)[i]!
      return { priority, level, role, within, channel }
    },
  },
  'occ.sources': {
    count: 14,
    make: ({ i }) => {
      const [name, plant, kind, protocol] = ([
        ['Acid plant DCS', 9, 'DCS / SCADA', 'OPC UA'],
        ['Phosphoric unit PLC', 9, 'PLC gateway', 'Modbus TCP'],
        ['Gresik NPK DCS', 6, 'DCS / SCADA', 'OPC UA'],
        ['Granulation PLC', 6, 'PLC gateway', 'Profinet → MQTT'],
        ['Palembang urea DCS', 7, 'DCS / SCADA', 'OPC DA bridge'],
        ['Merak tank gauges', 10, 'IoT tank gauges', 'LoRaWAN → MQTT'],
        ['Gresik tank gauges', 11, 'IoT tank gauges', 'LoRaWAN → MQTT'],
        ['Rotama fleet GPS', 2, 'Fleet GPS', 'REST webhook'],
        ['Cilegon NVR', 9, 'CCTV NVR', 'RTSP / ONVIF'],
        ['Gresik NVR', 6, 'CCTV NVR', 'RTSP / ONVIF'],
        ['Cilegon energy meters', 9, 'Energy meter', 'Modbus RTU'],
        ['Gresik energy meters', 6, 'Energy meter', 'Modbus RTU'],
        ['Lampung warehouse PLC', 8, 'PLC gateway', 'Modbus TCP'],
        ['Surabaya depot NVR', 4, 'CCTV NVR', 'RTSP / ONVIF'],
      ] as const)[i]!
      return { name, site: `PLT-${String(plant).padStart(4, '0')}`, kind, protocol }
    },
  },
  'occ.cameras': {
    count: 18,
    make: ({ i, pick }) => ({ name: `CAM-${String(i + 1).padStart(2, '0')}`, site: `PLT-${String([9, 9, 9, 6, 6, 6, 10, 10, 11, 2, 2, 4, 4, 7, 7, 8, 1, 3][i] ?? 1).padStart(4, '0')}`, zone: pick(['Gate', 'Process area', 'Tank farm', 'Loading bay', 'Warehouse', 'Control room']), analytics: pick(['None', 'PPE detection', 'Intrusion', 'Fire and smoke']) }),
  },
  'occ.alarms': {
    count: 30,
    make: ({ i, pick, int, day, ref }) => {
      const message = pick(['Converter bed 2 temperature high', 'Granulator drum tripped on overload', 'NH₃ detector 3 above 25 ppm at bay B', 'Stack S-1 SO₂ at 93% of limit', 'Tanker B 9037 TRA over speed 91 km/h', 'Merak gauge T-102 silent for 9 min', 'Dryer burner flame failure', 'Feeder Gresik voltage dip 86%', 'T-105 level 94%', 'Mixer gearbox vibration 8.2 mm/s'])
      return { unit: ref('occ.units'), definition: ref('occ.register'), priority: pick(['Critical', 'High', 'High', 'Medium', 'Medium', 'Low']), message, reading: `${int(10, 999)}`, assignee: i % 3 ? pick(['Shift supervisor', 'O&M Engineer', 'Area technician']) : '', escalation: pick(['1 · Site O&M', '1 · Site O&M', '2 · Command centre', '3 · Management']), resolution: '', raised: day(-30, 0) }
    },
  },
  'occ.energy': {
    count: 60,
    make: ({ i, int, day }) => {
      const plant = [9, 6, 7][i % 3] ?? 9
      const output = int(700, 1500)
      return { site: `PLT-${String(plant).padStart(4, '0')}`, date: day(-150, 0), power: int(110, 260), gas: plant === 7 ? int(9000, 16000) : int(0, 900), diesel: int(2, 18), output }
    },
  },
  'occ.projects': {
    count: 8,
    make: ({ i, int, day }) => {
      const [title, plant, contractor] = ([
        ['Acid plant debottlenecking 1,400 t/day', 9, 'PT Rekayasa Industri'],
        ['NPK Line C granulation train', 6, 'PT Wijaya Karya'],
        ['Merak tank T-107 ammonia sphere', 10, 'PT Tripatra'],
        ['Waste heat recovery turbine 6 MW', 9, 'PT Siemens Indonesia'],
        ['Palembang urea revamp', 7, 'PT Inti Karya Persada'],
        ['Group command centre fit-out', 1, 'PT Data Center Nusantara'],
        ['Surabaya depot automation', 4, 'PT Swadaya Graha'],
        ['Rooftop solar 2 MWp Gresik', 6, 'PT Solar Energi'],
      ] as const)[i]!
      const budget = int(15, 900) * 1e9
      const progress = int(5, 95)
      return { title, site: `PLT-${String(plant).padStart(4, '0')}`, budget, spent: Math.round(budget * (progress / 100) * (0.9 + int(0, 25) / 100)), progress, contractor, due: day(60, 700) }
    },
  },

  'mdm.companies': {
    count: 4,
    make: ({ i }) => {
      const [code, name, entity, address] = ([
        ['1000', 'PT Satona', 'holding', 'Jl. Jend. Sudirman Kav. 52, Jakarta'],
        ['2000', 'PT Rotama Indonesia', 'rotama', 'Jl. Raya Anyer KM 3, Cilegon'],
        ['3000', 'PT Rodame Indonesia', 'rodame', 'Jl. Tanjung Harapan, Gresik'],
        ['4000', 'PT Roasi Sinergi Industri', 'roasi', 'Kawasan Industri KIEC, Cilegon'],
      ] as const)[i]!
      return { code, name, entity, npwp: `0${i + 1}.${310 + i * 7}.${520 + i}.1-0${i}1.000`, address, currency: 'IDR' }
    },
  },
  'mdm.plants': {
    count: SITES.length,
    make: ({ i }) => {
      const site = SITES[i] ?? SITES[0]!
      const company = `CC-000${['holding', 'rotama', 'rodame', 'roasi'].indexOf(site.entity) + 1}`
      const kind = { hq: 'Head office', plant: 'Plant', depot: 'Depot', warehouse: 'Warehouse', 'tank-farm': 'Tank farm' }[site.kind]
      return { code: `P${String(i + 1).padStart(3, '0')}`, name: site.name, company, kind, city: site.city }
    },
  },
  'mdm.costcenters': {
    count: 16,
    make: ({ i, int, pick }) => {
      const dept = ['Finance', 'HR', 'Production', 'Maintenance', 'Logistics', 'QC', 'HSE', 'Procurement'][i % 8] ?? 'Finance'
      return { code: `${(i % 4) + 1}${String(100 + i * 10)}`, name: `${dept} ${pick(['Gresik', 'Cilegon', 'Jakarta', 'Palembang'])}`, company: `CC-000${(i % 4) + 1}`, owner: `${dept} Manager`, budget: int(4, 90) * 1e9 }
    },
  },
  'mdm.profitcenters': {
    count: 8,
    make: ({ i }) => {
      const [name, segment, c] = ([
        ['Group corporate', 'Corporate', 1],
        ['Bulk liquid freight', 'Logistics', 2],
        ['Dry bulk freight', 'Logistics', 2],
        ['Subsidised fertiliser', 'Fertiliser', 3],
        ['Commercial NPK', 'Fertiliser', 3],
        ['Sulfuric acid', 'Chemicals', 4],
        ['Phosphoric acid', 'Chemicals', 4],
        ['Oleum & specialties', 'Chemicals', 4],
      ] as const)[i]!
      return { code: `PC${c}${i + 1}0`, name, company: `CC-000${c}`, segment }
    },
  },
  'mdm.uom': {
    count: 9,
    make: ({ i }) => {
      const [code, name, dimension, toBase] = ([
        ['t', 'Metric tonne', 'Mass', 1000],
        ['kg', 'Kilogram', 'Mass', 1],
        ['m³', 'Cubic metre', 'Volume', 1000],
        ['L', 'Litre', 'Volume', 1],
        ['pcs', 'Piece', 'Count', 1],
        ['bag', 'Bag 50 kg', 'Count', 1],
        ['km', 'Kilometre', 'Length', 1000],
        ['h', 'Hour', 'Time', 60],
        ['min', 'Minute', 'Time', 1],
      ] as const)[i]!
      return { code, name, dimension, toBase }
    },
  },
  'mdm.paymentterms': {
    count: 5,
    make: ({ i }) => {
      const [code, name, days, discount] = ([
        ['Z000', 'Due immediately', 0, 0],
        ['Z014', 'Net 14 days', 14, 0],
        ['Z030', 'Net 30 days', 30, 0],
        ['Z045', '2% in 10 days, net 45', 45, 2],
        ['Z060', 'Net 60 days (import)', 60, 0],
      ] as const)[i]!
      return { code, name, days, discount }
    },
  },
  'mdm.banks': {
    count: 8,
    make: ({ i, int }) => ({ name: ['Bank Mandiri', 'BNI', 'BRI', 'BCA'][i % 4] ?? 'BNI', company: `CC-000${(i % 4) + 1}`, account: `${int(100, 999)}-${int(10000, 99999)}-${int(100, 999)}`, currency: i < 4 ? 'IDR' : 'USD' }),
  },
  'epm.periods': {
    count: 12,
    make: ({ i }) => {
      const d = new Date(Date.UTC(2026, 9 - Math.floor(i / 4), 1))
      return { period: d.toISOString().slice(0, 7), company: `CC-000${(i % 4) + 1}` }
    },
  },
  'vms.inforecords': {
    count: 16,
    make: ({ int, ref }) => ({ vendor: ref('mdm.partners'), material: ref('mdm.materials'), price: int(18, 140) * 100_000, leadTime: int(3, 45), terms: ref('mdm.paymentterms') }),
  },
  'vms.contracts': {
    count: 8,
    make: ({ i, int, day, ref }) => ({ title: `${['Ammonia', 'Phosphoric acid', 'Sulfur', 'KCl', 'Spare parts', 'Freight fuel', 'Catalyst', 'Bags'][i]} supply 2026-2027`, vendor: ref('mdm.partners'), target: int(20, 400) * 1e9, validTo: day(30, 500) }),
  },
  'grc.regulations': {
    count: 8,
    make: ({ i }) => {
      const [code, title, issuer, topic] = ([
        ['PP 22/2021', 'Environmental protection and management', 'KLHK', 'B3 waste'],
        ['PermenLHK 6/2021', 'B3 waste management procedures', 'KLHK', 'B3 waste'],
        ['PM 60/2019', 'Transport of dangerous goods by road', 'Kemenhub', 'Dangerous goods transport'],
        ['PP 50/2012', 'Occupational safety management system (SMK3)', 'Kemnaker', 'K3'],
        ['Permenaker 5/2018', 'K3 in the working environment', 'Kemnaker', 'K3'],
        ['PermenLHK 11/2021', 'Emission standards for stationary sources', 'KLHK', 'Emissions'],
        ['PP 28/2021', 'Industrial affairs', 'Kemenperin', 'Industry licence'],
        ['Permendag 15/2013', 'Procurement of subsidised fertiliser', 'Kemenperin', 'Industry licence'],
      ] as const)[i]!
      return { code, title, issuer, topic }
    },
  },
  'tms.locations': {
    count: 12,
    make: ({ i }) => {
      const [name, kind, city] = ([
        ['Depot Cilegon', 'Depot', 'Cilegon'],
        ['Fleet pool Cikampek', 'Depot', 'Karawang'],
        ['Depot Surabaya', 'Depot', 'Surabaya'],
        ['Hub Semarang', 'Depot', 'Semarang'],
        ['Rodame plant Gresik', 'Plant', 'Gresik'],
        ['Rodame plant Palembang', 'Plant', 'Palembang'],
        ['Roasi plant Cilegon', 'Plant', 'Cilegon'],
        ['Port of Merak', 'Port', 'Merak'],
        ['Port of Bakauheni', 'Port', 'Lampung Selatan'],
        ['Warehouse Bandar Lampung', 'Ship-to', 'Bandar Lampung'],
        ['Customer site Malang', 'Ship-to', 'Malang'],
        ['Customer site Bandung', 'Ship-to', 'Bandung'],
      ] as const)[i]!
      return { name, kind, city }
    },
  },
  'tms.drivers': {
    count: DRIVERS.length + 4,
    make: ({ i, int, day, ref }) => ({
      name: DRIVERS[i] ?? ['Wahyu Hidayat', 'Rizky Pratama', 'Dimas Kurniawan', 'Ahmad Fauzi'][i - DRIVERS.length] ?? 'Driver',
      sim: `B2U-${int(1000, 9999)}-${int(100000, 999999)}`,
      phone: `08${int(11, 59)}-${int(1000, 9999)}-${int(1000, 9999)}`,
      base: ref('tms.locations'),
      joined: day(-2400, -200),
    }),
  },
  'tms.lanes': {
    count: LANES.length,
    make: ({ i, int }) => {
      const [o, d] = ([
        [1, 2],
        [5, 11],
        [1, 10],
        [5, 4],
        [2, 4],
        [6, 10],
        [1, 12],
        [3, 11],
      ] as const)[i]!
      const distance = int(90, 780)
      return { name: LANES[i] ?? '', origin: `LOC-000${o}`.replace('LOC-00010', 'LOC-0010'), destination: `LOC-${String(d).padStart(4, '0')}`, distance, hours: Math.max(2, Math.round(distance / 55)), toll: i % 3 === 2 ? 'No' : 'Yes' }
    },
  },
  'wms.warehouses': {
    count: 4,
    make: ({ i, int }) => ({ code: `W${i + 1}00`, name: ['Surabaya bulk store', 'Cilegon chemical store', 'Gresik finished goods', 'Lampung transit'][i] ?? '', plant: `PLT-${String([4, 2, 6, 8][i] ?? 1).padStart(4, '0')}`, area: int(2, 18) * 1000 }),
  },
  'wms.bins': {
    count: 48,
    make: ({ i, int, pick }) => ({ bin: `${String.fromCharCode(65 + (i % 4))}-${String(1 + Math.floor(i / 4)).padStart(2, '0')}-${int(1, 6)}`, zone: `ZON-${String((i % 12) + 1).padStart(4, '0')}`, kind: pick(['Rack', 'Rack', 'Bulk floor', 'Drum bay', 'Cylinder cage']), maxPallets: int(4, 40) }),
  },
  'haz.unlist': {
    count: 7,
    make: ({ i }) => {
      const [un, name, hazardClass, packing, erg] = ([
        ['UN1005', 'Ammonia, anhydrous', 'Class 2.3 Toxic gas', 'n/a', '125'],
        ['UN1830', 'Sulfuric acid, >51% acid', 'Class 8 Corrosive', 'II', '137'],
        ['UN1805', 'Phosphoric acid, solution', 'Class 8 Corrosive', 'III', '154'],
        ['UN1824', 'Sodium hydroxide solution', 'Class 8 Corrosive', 'II', '154'],
        ['UN2448', 'Sulfur, molten', 'Class 4.1 Flammable solid', 'III', '133'],
        ['UN1831', 'Sulfuric acid, fuming (oleum)', 'Class 8 Corrosive', 'I', '137'],
        ['UN1079', 'Sulfur dioxide', 'Class 2.3 Toxic gas', 'n/a', '125'],
      ] as const)[i]!
      return { un, name, hazardClass, packing, erg }
    },
  },
  'bpf.bom': {
    count: 18,
    make: ({ i, int }) => ({ formula: `FRM-${String((i % 6) + 1).padStart(4, '0')}`, material: `MAT-${String([1, 2, 6, 3][i % 4] ?? 1).padStart(4, '0')}`, kgPerT: int(80, 420), scrap: int(1, 4) }),
  },
  'mrp.workcenters': {
    count: 12,
    make: ({ i, int }) => {
      const kind = ['Mixer', 'Granulator', 'Dryer', 'Cooler', 'Screen', 'Bagging'][i % 6] ?? 'Mixer'
      const line = ['Line A Gresik', 'Line B Gresik'][Math.floor(i / 6)] ?? 'Line A Gresik'
      return { name: `${kind} ${line.split(' ')[1]}-${(i % 6) + 1}`, line, kind, capacity: int(25, 60), shifts: 3 }
    },
  },
  'qc.plans': {
    count: 18,
    make: ({ i }) => {
      const parameter = ['Total N', 'P₂O₅', 'K₂O', 'Moisture', 'Granule size 2-4 mm', 'Hardness'][i % 6] ?? 'Moisture'
      const limits: Record<string, [number, number, string]> = {
        'Total N': [14.5, 16, 'Kjeldahl'],
        'P₂O₅': [14.5, 16, 'Spectrophotometry'],
        'K₂O': [14.5, 16, 'Flame photometry'],
        Moisture: [0, 2.5, 'Oven drying'],
        'Granule size 2-4 mm': [90, 100, 'Sieve analysis'],
        Hardness: [2, 6, 'Crush test'],
      }
      const [min, max, method] = limits[parameter] ?? [0, 1, 'Oven drying']
      return { formula: `FRM-000${2 + Math.floor(i / 6)}`, parameter, min, max, method }
    },
  },
  'eam.parts': {
    count: 20,
    make: ({ i, int }) => ({ partNo: `SP-${int(10000, 99999)}`, name: ['Bearing SKF 22320', 'Granulator liner plate', 'Dryer flight', 'V-belt SPC 5000', 'Gearbox oil 220', 'Load cell 30 t', 'Screen mesh 4 mm', 'Mechanical seal 60 mm', 'Chain ANSI 120', 'Burner nozzle'][i % 10] ?? '', onHand: int(0, 24), minStock: int(2, 8), unitCost: int(3, 180) * 100_000 }),
  },
  'eam.plans': {
    count: 16,
    make: ({ pick, day, ref }) => ({ task: pick(['Lubrication round', 'Bearing inspection', 'Liner replacement', 'Load cell calibration', 'Vibration route', 'Burner service']), asset: ref('eam.assets'), strategy: pick(['Time based', 'Time based', 'Meter based', 'Condition based']), interval: pick([7, 14, 30, 90, 180]), nextDue: day(-5, 60) }),
  },
  'dms.kiosks': {
    count: 40,
    make: ({ i, int, ref }) => ({ name: `Kios ${['Tani Jaya', 'Subur', 'Makmur', 'Berkah Tani', 'Sri Rejeki', 'Panen Raya', 'Sumber Rejeki', 'Harapan Tani'][i % 8]} ${i + 1}`, distributor: ref('dms.distributors'), village: `Kec. ${['Ngoro', 'Kepanjen', 'Wates', 'Sukamaju', 'Tegalrejo', 'Karanganyar', 'Purwosari', 'Sidomulyo'][i % 8]}`, farmers: int(80, 900) }),
  },
  'dms.prices': {
    count: 8,
    make: ({ i, day }) => {
      const product = ['Urea', 'NPK 15-15-15', 'NPK 16-16-16', 'ZA'][i % 4] ?? 'Urea'
      const subsidised = i < 4
      const het: Record<string, number> = { Urea: 2_250_000, 'NPK 15-15-15': 2_300_000, 'NPK 16-16-16': 2_300_000, ZA: 1_700_000 }
      return { product, scheme: subsidised ? 'Subsidised' : 'Commercial', pricePerT: subsidised ? (het[product] ?? 0) : Math.round((het[product] ?? 0) * 3.2), validFrom: day(-200, -30) }
    },
  },
  'cfp.units': {
    count: 6,
    make: ({ i }) => {
      const [name, kind, design, tag] = ([
        ['R-101 Sulfur burner', 'Reactor', 1200, '10-R-101'],
        ['C-102 SO₂ converter', 'Converter', 1200, '10-C-102'],
        ['A-103 Final absorber', 'Absorber', 1150, '10-A-103'],
        ['R-201 Phosphoric reactor', 'Reactor', 600, '20-R-201'],
        ['E-202 Acid evaporator', 'Evaporator', 560, '20-E-202'],
        ['S-301 Tail gas scrubber', 'Scrubber', 1300, '30-S-301'],
      ] as const)[i]!
      return { name, kind, design, tag }
    },
  },
  'ehs.points': {
    count: 4,
    make: ({ i }) => ({ name: ['Stack S-1', 'Stack S-2', 'Stack S-3', 'WWTP outlet'][i] ?? '', medium: i < 3 ? 'Air (stack)' : 'Wastewater', permit: `SK-KLHK-${2021 + (i % 3)}/${310 + i}`, height: i < 3 ? 45 + i * 10 : 0 }),
  },
  'ehs.hazards': {
    count: 14,
    make: ({ pick, ref }) => ({ area: pick(['Acid plant', 'Tank farm Merak', 'Loading bay', 'Laboratory', 'Sulfur melter']), chemical: ref('ehs.sds'), exposure: pick(['Low', 'Medium', 'Medium', 'High']), ppe: pick(['Face shield, acid suit, PVC gloves', 'Full-face respirator (ABEK), gloves', 'Safety glasses, lab coat, nitrile gloves', 'SCBA for entry, gas detector']) }),
  },
  'tfm.gauges': {
    count: 18,
    make: ({ i, day }) => ({ sensor: `IOT-${String(4100 + i)}`, tank: `TNK-${String((i % 6) + 1).padStart(4, '0')}`, kind: ['Radar level', 'Temperature', 'Pressure'][Math.floor(i / 6)] ?? 'Radar level', calibrated: day(-200, -3) }),
  },
  'gtr.specs': {
    count: 10,
    make: ({ i }) => {
      const [product, parameter, min, max, unit] = ([
        ['Sulfuric acid 98%', 'H₂SO₄ assay', 98, 99, '%'],
        ['Sulfuric acid 98%', 'Iron (Fe)', 0, 50, 'ppm'],
        ['Phosphoric acid 52%', 'P₂O₅', 52, 54, '%'],
        ['Phosphoric acid 52%', 'Solids', 0, 1, '%'],
        ['Ammonia solution', 'NH₃ assay', 24.5, 25.5, '%'],
        ['Oleum 20%', 'Free SO₃', 20, 22, '%'],
        ['Oleum 20%', 'Colour', 0, 50, 'APHA'],
        ['Caustic soda 48%', 'NaOH', 47.5, 49, '%'],
        ['Caustic soda 48%', 'NaCl', 0, 1.2, '%'],
        ['Ammonia solution', 'Residue', 0, 20, 'ppm'],
      ] as const)[i]!
      return { product, parameter, min, max, unit }
    },
  },
  'mdm.accounts': {
    count: 24,
    make: ({ i, pick }) => {
      const [cls, base] = pick([['Asset', 1], ['Liability', 2], ['Equity', 3], ['Revenue', 4], ['Expense', 5]] as const)
      const names: Record<string, string[]> = {
        Asset: ['Cash in bank', 'Trade receivables', 'Raw material inventory', 'Plant & machinery', 'Intercompany receivable'],
        Liability: ['Trade payables', 'Accrued expenses', 'Bank loan', 'Intercompany payable'],
        Equity: ['Share capital', 'Retained earnings'],
        Revenue: ['Fertiliser sales', 'Chemical sales', 'Freight revenue', 'Intercompany freight'],
        Expense: ['Raw material cost', 'Fuel', 'Maintenance', 'Salaries', 'Depreciation'],
      }
      const name = pick(names[cls] ?? [])
      return { code: `${base}${String(100 + i * 7).slice(0, 3)}0`, name, class: cls, entity: pick(ENTITIES), groupAccount: groupAccountFor(name) }
    },
  },
  'mdm.partners': {
    count: PARTNERS.length,
    make: ({ i, int, pick }) => {
      const [name, kind, city] = PARTNERS[i] ?? PARTNERS[0]!
      return { name, kind, city, npwp: `0${int(1, 9)}.${int(100, 999)}.${int(100, 999)}.${int(1, 9)}-${int(100, 999)}.000`, entity: kind === 'Intercompany' ? 'holding' : pick(ENTITIES) }
    },
  },
  'mdm.materials': {
    count: MATERIALS.length,
    make: ({ i }) => {
      const [code, name, b3Class] = MATERIALS[i] ?? MATERIALS[0]!
      return { code, name, b3Class, uom: b3Class === 'Non-B3' ? 't' : 'm³', ...(MATERIAL_HAZARDS[code] ?? { unNumber: '', cas: '', packingGroup: 'None', signalWord: 'None' }) }
    },
  },
  'mdm.employees': {
    count: 60,
    make: ({ i, pick, day }) => {
      // Spread people over the org sections and departments so every unit page has staff.
      const unit = [12, 13, 14, 15, 9, 10, 11, 4, 5, 6, 7, 8][i % 12]!
      return {
        nik: `SAT-${String(10230 + i * 13)}`,
        name: `${pick(['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Gilang', 'Hana', 'Indra', 'Joko', 'Kartika', 'Lina'])} ${pick(['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Hidayat', 'Kusuma', 'Siregar', 'Nugroho'])}`,
        entity: unit >= 12 ? (unit === 14 ? 'rodame' : unit === 15 ? 'rotama' : 'roasi') : ENTITIES[i % 4],
        department: pick(['Finance', 'HR', 'Production', 'Logistics', 'QC', 'HSE', 'Procurement', 'IT']),
        orgunit: `ORG-${String(unit + 1).padStart(4, '0')}`,
        position: `JOB-${String((i % 24) + 1).padStart(4, '0')}`,
        employment: pick(['Permanent', 'Permanent', 'Permanent', 'Fixed term', 'Outsourced']),
        joined: day(-3600, -60),
      }
    },
  },
  'epm.consolidations': {
    count: 8,
    make: ({ i, int }) => {
      const d = new Date()
      d.setUTCMonth(d.getUTCMonth() - 1 - i)
      const revenue = int(170, 230) * 1e9
      return { period: d.toISOString().slice(0, 7), revenue, eliminations: int(18, 30) * 1e9, netIncome: Math.round(revenue * (0.08 + (i % 4) * 0.012)) }
    },
  },
  'epm.intercompany': {
    count: 26,
    make: ({ i, pick, int, day }) => {
      const [from, to, description] = pick([
        ['rotama', 'rodame', 'Freight NPK Gresik'],
        ['rotama', 'roasi', 'Freight acid Cilegon'],
        ['roasi', 'rodame', 'Sulfuric acid supply'],
        ['holding', 'rotama', 'Shared service fee'],
        ['holding', 'rodame', 'Shared service fee'],
        ['holding', 'roasi', 'Management fee'],
      ] as const)
      const amount = int(4, 90) * 1e8
      // A few receivers booked a different amount, so IC reconciliation has differences to clear.
      return { from, to, description, amount, date: day(-150, 0), counterAmount: i % 6 === 2 ? amount - 35_000_000 : amount }
    },
  },
  'epm.fx': {
    count: 15,
    make: ({ i, day }) => {
      const cur = ['USD', 'EUR', 'SGD', 'CNY', 'JPY'][i % 5] ?? 'USD'
      const base: Record<string, number> = { USD: 16_250, EUR: 17_600, SGD: 12_150, CNY: 2_240, JPY: 108 }
      return { currency: cur, rate: Math.round((base[cur] ?? 1) * (1 + ((i % 3) - 1) * 0.008)), date: day(-60 + Math.floor(i / 5) * 25, -60 + Math.floor(i / 5) * 25) }
    },
  },
  'epm.budgets': {
    count: 8,
    make: ({ i, int }) => {
      const e = ENTITIES[i % 4] ?? 'holding'
      return { name: `${e === 'holding' ? 'Holding' : e[0]!.toUpperCase() + e.slice(1)} FY${i < 4 ? 2027 : 2026}`, entity: e, year: i < 4 ? 2027 : 2026, opex: int(80, 600) * 1e9, capex: int(20, 300) * 1e9, version: i < 4 ? 'Original' : i % 2 ? 'Revised' : 'Forecast' }
    },
  },
  'vms.requisitions': {
    count: 22,
    make: ({ pick, int, day, ref }) => {
      const what = pick(['Ammonia', 'Phosphoric acid', 'Sulfur', 'Potassium chloride', 'Spare bearings', 'Catalyst V2O5'])
      return { title: `${what} for ${pick(['Q4 run', 'shutdown', 'Line A', 'safety stock'])}`, material: ref('mdm.materials'), qty: int(20, 900), entity: pick(['rodame', 'roasi', 'rotama']), vendor: ref('mdm.partners'), value: int(3, 120) * 1e8, needBy: day(-30, 60) }
    },
  },
  'vms.ratings': {
    count: 12,
    make: ({ i, int, ref }) => ({ vendor: ref('mdm.partners'), period: `2026-Q${(i % 3) + 1}`, quality: int(60, 98), delivery: int(55, 99), price: int(50, 95) }),
  },
  'grc.permits': {
    count: 14,
    make: ({ pick, day }) => ({
      name: pick(['Izin penyimpanan limbah B3', 'Izin angkut B3 (Kemenhub)', 'Izin lingkungan (AMDAL)', 'Izin usaha industri', 'Izin TPS limbah B3', 'Izin pengelolaan air limbah']),
      issuer: pick(['KLHK', 'Kemenhub', 'ESDM', 'Pemda', 'BKPM']),
      entity: pick(ENTITIES),
      expiry: day(-20, 400),
    }),
  },
  'grc.findings': {
    count: 23,
    make: ({ pick, day }) => ({
      title: pick(['Spill kit missing at bay 3', 'Manifest copy not archived', 'Late bank reconciliation', 'Shared admin password', 'Expired fire extinguisher', 'Gas detector not calibrated', 'PPE not worn at loading', 'Contract without legal review']),
      area: pick(['Environment', 'K3 / EHS', 'Finance', 'IT', 'Legal']),
      severity: pick(['Low', 'Medium', 'Medium', 'High', 'Critical']),
      entity: pick(ENTITIES),
      owner: pick(['EH&S Auditor', 'Risk Officer', 'Legal Manager', 'Financial Controller']),
      due: day(-40, 60),
    }),
  },
  'grc.risks': {
    count: 17,
    make: ({ pick, int }) => ({
      title: pick(['Ammonia leak at Merak', 'Tanker rollover on toll road', 'Subsidy quota cut', 'FX swing on imported phosphate', 'Granulator breakdown in peak season', 'Ransomware on ERP', 'Stack emission over limit', 'Key supplier insolvency']),
      entity: pick(ENTITIES),
      likelihood: int(1, 5),
      impact: int(2, 5),
      owner: 'Risk Officer',
    }),
  },
  'bi.kpis': {
    count: 12,
    make: ({ i, int }) => {
      const [kpi, entity, target] = ([
        ['On-time delivery %', 'rotama', 95],
        ['Cost per km (Rp)', 'rotama', 15000],
        ['NPK output (t)', 'rodame', 40000],
        ['Batch first-pass yield %', 'rodame', 96],
        ['Reactor uptime %', 'roasi', 98],
        ['Yield loss %', 'roasi', 2.5],
      ] as const)[i % 6]!
      return { kpi, entity, period: i < 6 ? '2026-09' : '2026-10', target, actual: Math.round(target * (0.88 + int(0, 18) / 100) * 10) / 10 }
    },
  },

  'tms.vehicles': {
    count: TRUCKS.length + 4,
    make: ({ i, pick, int, day }) => ({ plate: TRUCKS[i]?.plate ?? `L ${8900 + i} RT`, kind: TRUCKS[i]?.hazard.startsWith('UN') ? 'Iso tank' : pick(['Bulk tipper', 'Box truck', 'Flatbed', 'Iso tank']), capacity: pick([20, 24, 30, 32]), odometer: int(40, 380) * 1000, lastService: day(-90, -2) }),
  },
  'tms.trips': {
    count: 36,
    make: ({ i, int, day, ref }) => {
      const trip = { route: ref('tms.lanes'), vehicle: ref('tms.vehicles'), driver: ref('tms.drivers'), cargo: ref('mdm.materials'), qty: int(14, 30), distance: int(90, 780), departure: day(-160, 7) }
      return { ...trip, stops: 1 + (i % 3), tripCost: trip.distance * 12_400 }
    },
  },
  'wms.zones': {
    count: 12,
    make: ({ i, int }) => {
      const hazard = ['Non-B3', 'Non-B3', 'Class 8 Corrosive', 'Class 8 Corrosive', 'Class 2.3 Toxic gas', 'Class 4.1 Flammable solid', 'Non-B3', 'Class 8 Corrosive', 'Non-B3', 'Non-B3', 'Non-B3', 'Class 8 Corrosive'][i] ?? 'Non-B3'
      const wh = i < 4 ? 1 : i < 8 ? 2 : i < 10 ? 3 : 4
      const city = ['Surabaya', 'Cilegon', 'Gresik', 'Lampung'][wh - 1]
      const capacity = int(200, 900)
      return { zone: `${['A', 'B', 'C', 'D'][i % 4]}${Math.floor(i / 4) + 1} ${city}`, warehouse: `WH-000${wh}`, hazard, capacity, used: Math.round(capacity * (0.4 + (i % 5) * 0.12)) }
    },
  },
  'wms.lots': {
    count: 90,
    make: ({ i, int, day, ref }) => {
      const b = int(0, 47)
      return { lotNo: `L-2610-${String(100 + i)}`, bin: `BIN-${String(b + 1).padStart(4, '0')}`, material: ref('mdm.materials'), zone: `ZON-${String((b % 12) + 1).padStart(4, '0')}`, qty: int(5, 120), expiry: day(10, 400) }
    },
  },
  'haz.manifests': {
    count: 28,
    make: ({ i, pick, int, ref }) => {
      const [unNumber, hazardClass] = pick([
        ['UN1830', 'Class 8 Corrosive'],
        ['UN1805', 'Class 8 Corrosive'],
        ['UN1005', 'Class 2.3 Toxic gas'],
        ['UN2448', 'Class 4.1 Flammable solid'],
        ['UN1824', 'Class 8 Corrosive'],
      ] as const)
      return { trip: ref('tms.trips'), unNumber, hazardClass, qty: int(14, 30), festronik: `FST-2610-${String(4100 + i * 7)}`, generator: i % 2 ? 'PT Roasi Sinergi Industri' : 'PT Rodame Indonesia', transporter: 'PT Rotama Indonesia', receiver: ['PT Prasadha Pamunah Limbah', 'PT Petrokimia Mitra', 'PT Indo Detergent'][i % 3] }
    },
  },
  'haz.certificates': {
    count: DRIVERS.length * 2,
    make: ({ i, day }) => ({ driver: DRIVERS[i % DRIVERS.length] ?? '', certType: i < DRIVERS.length ? 'Dangerous goods (ADR)' : 'Safety passport', issued: day(-700, -300), expiry: day(-10, 500) }),
  },
  'fbl.rates': {
    count: LANES.length,
    make: ({ i, int }) => {
      const cost = int(118, 175) * 100
      const [fuel, toll, driverCost] = [Math.round(cost * 0.52), Math.round(cost * 0.18), Math.round(cost * 0.16)]
      return { route: LANES[i] ?? '', fuel, toll, driverCost, overhead: cost - fuel - toll - driverCost, shrinkage: [0.5, 0.75, 1][i % 3], margin: int(8, 18) }
    },
  },
  'fbl.invoices': {
    count: 32,
    make: ({ i, pick, int, day, ref }) => ({ trip: ref('tms.trips'), billTo: pick(['PT Rodame Indonesia', 'PT Rodame Indonesia', 'PT Roasi Sinergi Industri', 'External customer']), distance: int(90, 780), ratePerKm: int(118, 175) * 100, margin: int(8, 18), issued: day(-160, 0), pod: i % 5 === 0 ? 'Pending' : 'Signed' }),
  },

  'fbl.inquiries': {
    count: 20,
    make: ({ i, day }) => ({
      customer: seedId('BP', 5 + (i % 6)),
      service: QUOTE_SERVICES[i % 4],
      lane: seedId('LN', i % LANES.length),
      commodity: ['Caustic soda 48%', 'NPK 15-15-15', 'Sulphuric acid 98%', 'Urea prill', 'Phosphoric acid 52%'][i % 5] ?? '',
      trips: 2 + (i % 7),
      needed: day(-20, 30),
      pic: ['Budi Santoso', 'Rina Wijaya', 'Agus Prasetyo', 'Dewi Lestari'][i % 4] ?? '',
      phone: `0812${String(31_000_000 + i * 7919).slice(0, 8)}`,
      email: `logistik${i + 1}@pelanggan.co.id`,
    }),
  },
  'fbl.quotations': {
    count: QUOTES,
    make: ({ i, day }) => {
      const lane = LANES[i % LANES.length] ?? ''
      const [origin, destination] = lane.split(' → ')
      return {
        title: `${QUOTE_SERVICES[i % 4]}, ${lane}`,
        customer: seedId('BP', 5 + (i % 6)),
        branch: seedId('LOC', i % 4),
        inquiry: i < 20 && i % 2 === 0 ? seedId('INQ', i) : '',
        pic: ['Budi Santoso', 'Rina Wijaya', 'Agus Prasetyo', 'Dewi Lestari'][i % 4] ?? '',
        phone: `0812${String(31_000_000 + i * 7919).slice(0, 8)}`,
        email: `logistik${i + 1}@pelanggan.co.id`,
        loadDate: day(-150, 30),
        origin,
        destination,
        validTo: day(0, 45),
        subtotal: quoteLines(i).reduce((sum, l) => sum + l.qty * l.price, 0),
        discount: i % 4 === 0 ? 1_000_000 : 0,
        ppnRate: 11,
      }
    },
  },
  'fbl.quotelines': { count: QUOTE_LINES.length, make: ({ i }) => QUOTE_LINES[i]! },

  'bpf.formulas': {
    count: FORMULAS.length,
    make: ({ i }) => {
      const [grade, nn, p, k] = FORMULAS[i] ?? FORMULAS[0]!
      return { grade, n: nn, p, k, moistureMax: 2.5, version: 1 + (i % 3), effective: `2026-0${1 + (i % 6)}-01`, substitute: i % 2 ? 'MAT-0006' : '', costPerT: (54 + i * 3) * 100_000 }
    },
  },
  'bpf.orders': {
    count: 30,
    make: ({ i, pick, int, day, ref }) => ({ title: `Batch ${2610 + i}`, formula: ref('bpf.formulas'), qty: int(40, 220), line: pick(['Line A Gresik', 'Line B Gresik', 'Urea Palembang']), planned: day(-160, 14) }),
  },
  'mrp.requirements': {
    count: 14,
    make: ({ int, day, ref }) => {
      const required = int(200, 4000)
      return { material: ref('mdm.materials'), required, onHand: Math.round(required * (0.3 + int(0, 90) / 100)), needBy: day(-5, 45) }
    },
  },
  'mrp.schedule': {
    count: 56,
    make: ({ int, day, ref }) => ({ machine: ref('mrp.workcenters'), order: ref('bpf.orders'), start: day(-3, 10), hours: int(10, 40) }),
  },
  'qc.samples': {
    count: 34,
    make: ({ int, ref }) => ({ order: ref('bpf.orders'), n: int(140, 162) / 10, p: int(140, 162) / 10, k: int(140, 162) / 10, moisture: int(12, 31) / 10 }),
  },
  'qc.coa': {
    count: 16,
    make: ({ i, pick, day, ref }) => ({ sample: ref('qc.samples'), customer: pick(DISTRIBUTORS.map((d) => d.name)), issued: day(-120, 0), lot: `L-2610-${100 + i * 3}`, signedBy: 'Ratna Wulandari, QC Head', distribution: (['Email', 'Customer portal', 'Printed with delivery'] as const)[i % 3] }),
  },
  'eam.assets': {
    count: 34,
    make: ({ i, pick, int }) => {
      if (i >= 16) {
        // Components: motors, gearboxes and burners filed under the machine they drive.
        const host = (i - 16) % 16
        const kind = (['Motor', 'Gearbox', 'Burner'] as const)[Math.floor((i - 16) / 6) % 3] ?? 'Motor'
        return { name: `${kind} ${host + 1}.${Math.floor((i - 16) / 16) + 1}`, parent: `AST-${String(host + 1).padStart(4, '0')}`, kind, site: host % 3 === 2 ? 'Palembang' : 'Gresik', criticality: 'B', mtbf: int(300, 1200) }
      }
      const kind = ['Granulator', 'Dryer', 'Mixer', 'Conveyor', 'Weighbridge', 'Boiler'][i % 6] ?? 'Mixer'
      return { name: `${kind} ${String.fromCharCode(65 + Math.floor(i / 6))}-${(i % 6) + 1}`, kind, site: i % 3 === 2 ? 'Palembang' : 'Gresik', criticality: pick(['A', 'B', 'B', 'C']), mtbf: int(180, 900) }
    },
  },
  'eam.workorders': {
    count: 60,
    make: ({ pick, int, day, ref }) => {
      const kind = pick(['Preventive', 'Preventive', 'Preventive', 'Corrective', 'Corrective', 'Emergency', 'Inspection', 'Calibration'])
      const breakdown = kind === 'Corrective' || kind === 'Emergency'
      const task = { Preventive: 'Monthly lubrication and belt check', Corrective: 'Replace worn drive bearing', Emergency: 'Restart tripped dryer burner', Inspection: 'Vibration route', Calibration: 'Calibrate belt weigher' }[kind] ?? 'Inspect'
      return {
        task,
        asset: ref('eam.assets'),
        kind,
        priority: kind === 'Emergency' ? 'P1' : breakdown ? pick(['P2', 'P3']) : pick(['P3', 'P4']),
        jobPlan: breakdown ? undefined : ref('eam.jobplans'),
        technician: ref('eam.technicians'),
        failure: breakdown ? `FC-000${pick([5, 5, 6, 7, 8, 9])}` : undefined,
        due: day(-150, 30),
        labourHours: int(1, breakdown ? 14 : 4),
        downtimeHours: breakdown ? int(1, 18) : 0,
        partsCost: int(0, 90) * 100_000,
      }
    },
  },
  'eam.requests': {
    count: 22,
    make: ({ pick, day, ref }) => ({ title: pick(['Granulator drum noisy', 'Dryer outlet temperature high', 'Conveyor belt tracking off', 'Bagging scale reading drifts', 'Oil leak at mixer gearbox', 'Screen deck torn']), asset: ref('eam.assets'), severity: pick(['Low', 'Medium', 'Medium', 'High', 'Critical']), impact: pick(['None', 'Reduced', 'Reduced', 'Stopped']), source: pick(['Operator', 'Operator', 'Inspection', 'Technician']), reported: day(-60, 0) }),
  },
  'eam.calibrations': {
    count: 16,
    make: ({ pick, int, day, ref }) => {
      const at = day(-300, -5)
      return { asset: ref('eam.assets'), certificate: `KAL-${int(10000, 99999)}`, result: pick(['Pass', 'Pass', 'Pass', 'Adjusted', 'Fail']), lab: pick(['PT Kalibrasi Nusantara', 'BSN-accredited lab Surabaya']), date: at, nextDue: new Date(new Date(at).getTime() + 365 * 86_400_000).toISOString().slice(0, 10) }
    },
  },
  'eam.rca': {
    count: 6,
    make: ({ i, pick, ref }) => ({
      title: ['Granulator G-1 drive bearing fails every 6 weeks', 'Dryer burner flame-out trips', 'Bucket elevator chain stretch', 'Bagging scale drift after washdown', 'Mixer gearbox oil leak', 'Screen deck tears on NPK 16 runs'][i] ?? '',
      asset: ref('eam.assets'),
      failure: `FC-000${pick([5, 6, 7, 8, 9])}`,
      trigger: pick(['Repeat failure', 'Repeat failure', 'Critical asset', 'High cost', 'Chronic']),
      category: pick(['Machine', 'Method', 'Material', 'Man']),
      whys: '1. Bearing overheats. 2. Grease degrades. 3. Lubrication interval too long for dust load. 4. PM plan copied from a clean-room spec. 5. No review of PM intervals per asset environment.',
      capa: 'Shorten lubrication to 7 days; fit labyrinth seals; review PM intervals for all dusty assets.',
    }),
  },
  'eam.failurecodes': {
    count: 16,
    make: ({ i }) => {
      const [code, name, kind] = ([
        ['PRB-HT', 'High temperature', 'Problem'],
        ['PRB-NS', 'Abnormal noise', 'Problem'],
        ['PRB-VB', 'Vibration', 'Problem'],
        ['PRB-LK', 'Leak', 'Problem'],
        ['FM-BW', 'Bearing wear', 'Mode'],
        ['FM-MF', 'Motor failure', 'Mode'],
        ['FM-SD', 'Seal damage', 'Mode'],
        ['FM-MA', 'Misalignment', 'Mode'],
        ['FM-CK', 'Caking and build-up', 'Mode'],
        ['CS-LB', 'Lubrication missed', 'Cause'],
        ['CS-DU', 'Dust ingress', 'Cause'],
        ['CS-CO', 'Corrosion from acid fumes', 'Cause'],
        ['CS-OL', 'Overload', 'Cause'],
        ['RM-RP', 'Replace part', 'Remedy'],
        ['RM-AD', 'Adjust and realign', 'Remedy'],
        ['RM-CL', 'Clean and descale', 'Remedy'],
      ] as const)[i]!
      return { code, name, kind }
    },
  },
  'eam.jobplans': {
    count: 8,
    make: ({ i }) => {
      const [name, woType, duration, skill] = ([
        ['Granulator monthly PM', 'Preventive', 120, 'Mechanical'],
        ['Rotary dryer burner service', 'Preventive', 180, 'Mechanical'],
        ['Motor bearing replacement', 'Corrective', 150, 'Mechanical'],
        ['MCC panel thermography', 'Inspection', 60, 'Electrical'],
        ['Belt weigher calibration', 'Calibration', 90, 'Instrument'],
        ['Conveyor belt splice', 'Corrective', 240, 'Mechanical'],
        ['Vibration route', 'Inspection', 45, 'Instrument'],
        ['PLC backup and I/O check', 'Inspection', 60, 'PLC'],
      ] as const)[i]!
      return { name, woType, duration, skill, loto: woType === 'Inspection' ? 'No' : 'Yes', tasks: 'Lock out and verify zero energy. Inspect, measure and record. Replace or adjust as needed. Remove locks and test run.' }
    },
  },
  'eam.technicians': {
    count: 12,
    make: ({ i, pick, int }) => ({ name: ['Agung', 'Bima', 'Dedi', 'Rizal', 'Sutrisno', 'Hendro', 'Yoga', 'Fadli', 'Arif', 'Taufik', 'Imam', 'Rudi'][i] + ' ' + pick(['Santoso', 'Wibowo', 'Saputra', 'Hidayat']), team: ['Mechanical', 'Mechanical', 'Mechanical', 'Electrical', 'Electrical', 'Instrument', 'Utility'][i % 7] ?? 'Mechanical', shift: pick(['A', 'B', 'C', 'Day']), level: int(1, 3), hourlyCost: int(55, 95) * 1000 }),
  },
  'eam.tools': {
    count: 12,
    make: ({ i, int, day }) => ({ name: ['Torque wrench 20-100 Nm', 'Bearing puller 3-jaw', 'Hydraulic bearing puller', 'Chain hoist 2 t', 'Laser alignment kit', 'Vibration analyser', 'Thermal camera', 'Multimeter', 'Insulation tester', 'Ultrasonic thickness gauge', 'Grease gun', 'Impact wrench'][i] ?? '', category: ['Hand tool', 'Hand tool', 'Hand tool', 'Lifting', 'Measuring', 'Measuring', 'Measuring', 'Measuring', 'Measuring', 'Measuring', 'Hand tool', 'Power tool'][i] ?? 'Hand tool', serial: `TL-${int(1000, 9999)}`, calibrated: day(-300, -10) }),
  },
  'mes.shifts': {
    count: 3,
    make: ({ i }) => {
      const [code, name, start, end] = ([
        ['SH-1', 'Pagi', '07:00', '15:00'],
        ['SH-2', 'Siang', '15:00', '23:00'],
        ['SH-3', 'Malam', '23:00', '07:00'],
      ] as const)[i]!
      return { code, name, start, end, breakMin: 45 }
    },
  },
  'mes.reasons': {
    count: 14,
    make: ({ i }) => {
      const [code, name, kind, planned] = ([
        ['DT-MEC', 'Mechanical breakdown', 'Downtime', 'No'],
        ['DT-ELE', 'Electrical trip', 'Downtime', 'No'],
        ['DT-UTL', 'Steam or power outage', 'Downtime', 'No'],
        ['DT-PM', 'Planned maintenance', 'Downtime', 'Yes'],
        ['DT-CHG', 'Grade changeover', 'Downtime', 'Yes'],
        ['DT-MAT', 'Raw material shortage', 'Downtime', 'No'],
        ['DT-CAK', 'Caking and drum cleaning', 'Downtime', 'No'],
        ['SCR-OVS', 'Oversize granules', 'Scrap', 'No'],
        ['SCR-FIN', 'Fines below 1 mm', 'Scrap', 'No'],
        ['SCR-WET', 'Moisture out of spec', 'Scrap', 'No'],
        ['PSE-BRK', 'Break', 'Pause', 'Yes'],
        ['PSE-QC', 'Waiting for lab result', 'Pause', 'No'],
        ['HLD-QC', 'Pending QC result', 'Hold', 'No'],
        ['HLD-DOC', 'Documentation missing', 'Hold', 'No'],
      ] as const)[i]!
      return { code, name, kind, planned }
    },
  },
  'mes.defects': {
    count: 8,
    make: ({ i }) => {
      const [code, name, severity] = ([
        ['DEF-01', 'Nutrient below guarantee', 'Critical'],
        ['DEF-02', 'Moisture above 2.5%', 'Major'],
        ['DEF-03', 'Granule size out of range', 'Major'],
        ['DEF-04', 'Caking in bag', 'Major'],
        ['DEF-05', 'Low crushing strength', 'Minor'],
        ['DEF-06', 'Dust above limit', 'Minor'],
        ['DEF-07', 'Bag underweight', 'Major'],
        ['DEF-08', 'Bag print or seal defect', 'Minor'],
      ] as const)[i]!
      return { code, name, severity }
    },
  },
  'mes.routing': {
    count: 24,
    make: ({ i, int }) => {
      const ops = ['Weighing', 'Mixing', 'Granulation', 'Drying', 'Cooling', 'Screening', 'Coating', 'Bagging'] as const
      const op = ops[i % 8] ?? 'Mixing'
      return { formula: `FRM-000${2 + Math.floor(i / 8)}`, seq: ((i % 8) + 1) * 10, operation: op, workcenter: `WC-${String((i % 6) + 1).padStart(4, '0')}`, minPerT: int(1, 6), qualityGate: op === 'Screening' || op === 'Bagging' ? 'Yes' : 'No' }
    },
  },
  'mes.workorders': {
    count: 48,
    make: ({ pick, int, day, ref }) => {
      const target = int(40, 180)
      const good = Math.round(target * (0.82 + int(0, 16) / 100))
      return { order: ref('bpf.orders'), operation: pick(['Mixing', 'Granulation', 'Drying', 'Screening', 'Bagging']), workcenter: ref('mrp.workcenters'), shift: ref('mes.shifts'), operator: pick(['Andi', 'Bayu', 'Candra', 'Doni', 'Eka', 'Fajar']), target, good, reject: int(0, 8), date: day(-45, 2) }
    },
  },
  'mes.oee': {
    count: 84,
    make: ({ i, int, day, ref }) => ({ workcenter: `WC-${String((i % 6) + 1).padStart(4, '0')}`, shift: ref('mes.shifts'), date: day(-28, 0), availability: int(74, 97), performance: int(70, 96), quality: int(92, 100) }),
  },
  'mes.downtime': {
    count: 40,
    make: ({ pick, int, day, ref }) => ({ workcenter: ref('mrp.workcenters'), reason: `RSN-000${pick([1, 1, 2, 3, 4, 5, 6, 7, 7])}`, shift: ref('mes.shifts'), date: day(-28, 0), minutes: int(10, 180), note: '' }),
  },
  'mes.holds': {
    count: 10,
    make: ({ pick, int, ref }) => ({ order: ref('bpf.orders'), defect: ref('mes.defects'), qty: int(5, 60), disposition: pick(['Rework', 'Scrap', 'Use as is', 'Release']) }),
  },
  'mes.ncr': {
    count: 6,
    make: ({ i, ref }) => ({ title: ['NPK 16 batch below N guarantee', 'Caking found in warehouse stock', 'Underweight bags from bagging line B', 'Oversize spike after granulator restart', 'Dust complaint from distributor', 'Wrong lot printed on bags'][i] ?? '', order: ref('bpf.orders'), defect: ref('mes.defects'), containment: 'Lot quarantined in warehouse; distributor deliveries stopped.', action: '' }),
  },
  'dms.distributors': {
    count: DISTRIBUTORS.length,
    make: ({ i }) => {
      const d = DISTRIBUTORS[i] ?? DISTRIBUTORS[0]!
      const region = { jatim: 'Jawa Timur', jateng: 'Jawa Tengah', jabar: 'Jawa Barat', lampung: 'Lampung', sumsel: 'Sumatera Selatan', sulsel: 'Sulawesi Selatan' }[d.region] ?? 'Jawa Timur'
      const creditLimit = (20 + (i % 4) * 10) * 1e9
      return { name: d.name, region, kiosks: d.kiosks, manager: d.manager, territory: `${region} ${['north', 'south', 'east', 'west'][i % 4]}`, target: 1200 + (i % 5) * 400, creditLimit, outstanding: Math.round(creditLimit * [0.42, 0.68, 0.93, 0.55, 1.04][i % 5]!) }
    },
  },
  'dms.quotas': {
    count: PROVINCES.length * 2,
    make: ({ i, int }) => {
      const quota = int(60, 420) * 1000
      return { region: PROVINCES[i % PROVINCES.length] ?? '', scheme: i < PROVINCES.length ? 'Subsidised' : 'Commercial', quota, used: Math.round(quota * (0.55 + int(0, 38) / 100)) }
    },
  },
  'dms.orders': {
    count: 40,
    make: ({ pick, int, day, ref }) => {
      const qty = int(20, 400)
      const scheme = pick(['Subsidised', 'Subsidised', 'Commercial'])
      return { distributor: ref('dms.distributors'), product: pick(['Urea', 'NPK 15-15-15', 'NPK 16-16-16', 'ZA']), scheme, qty, value: qty * (scheme === 'Subsidised' ? 2_250_000 : 7_400_000), date: day(-160, 0) }
    },
  },

  'cfp.logs': {
    count: 36,
    make: ({ i, int, day }) => {
      const feed = int(300, 420)
      return { reactor: ['R-101 Sulfuric', 'R-102 Phosphoric', 'R-103 Oleum'][i % 3] ?? '', shift: ['A', 'B', 'C'][Math.floor(i / 3) % 3] ?? 'A', date: day(-150, 0), feed, output: Math.round(feed * (0.94 + int(0, 50) / 1000)), byproduct: int(4, 20) }
    },
  },
  'cfp.waste': {
    count: 18,
    make: ({ pick, int, day }) => ({ wasteType: pick(['Gypsum', 'Gypsum', 'Spent catalyst', 'Acidic wastewater', 'Sludge']), qty: int(2, 80), method: pick(['Licensed B3 transporter', 'On-site treatment', 'Co-processing']), date: day(-150, 0) }),
  },
  'ehs.sds': {
    count: 10,
    make: ({ i, day }) => {
      const [chemical, cas, ghs] = ([
        ['Sulfuric acid 98%', '7664-93-9', 'Corrosive'],
        ['Phosphoric acid 52%', '7664-38-2', 'Corrosive'],
        ['Ammonia, anhydrous', '7664-41-7', 'Acute toxic'],
        ['Sulfur, molten', '7704-34-9', 'Flammable'],
        ['Oleum 20%', '8014-95-7', 'Corrosive'],
        ['Sodium hydroxide 48%', '1310-73-2', 'Corrosive'],
        ['Vanadium pentoxide catalyst', '1314-62-1', 'Health hazard'],
        ['Ammonium nitrate', '6484-52-2', 'Oxidizer'],
        ['Sulfur dioxide', '7446-09-5', 'Acute toxic'],
        ['Potassium chloride', '7447-40-7', 'Health hazard'],
      ] as const)[i]!
      return { chemical, cas, ghs, revision: day(-500, -10), version: 2 + (i % 4), language: i % 3 ? 'Both' : 'Bahasa Indonesia', signalWord: ghs === 'Health hazard' ? 'Warning' : 'Danger', pictograms: { Corrosive: 'GHS05', 'Acute toxic': 'GHS06', Oxidizer: 'GHS03', Flammable: 'GHS02', 'Health hazard': 'GHS08' }[ghs], sections: i % 4 === 3 ? 14 : 16 }
    },
  },
  'ehs.emissions': {
    count: 36,
    make: ({ i, int, day, ref }) => {
      const [parameter, limit] = ([
        ['SO₂', 800],
        ['NOx', 1000],
        ['PM', 150],
        ['COD', 100],
      ] as const)[i % 4]!
      return { stack: ref('ehs.points'), parameter, limit, value: Math.round(limit * (0.4 + int(0, 66) / 100) * 10) / 10, date: day(-150, 0) }
    },
  },
  'ehs.incidents': {
    count: 14,
    make: ({ pick, day }) => ({ title: pick(['Acid splash during sampling', 'Forklift near miss at tank farm', 'Small sulfur fire at conveyor', 'Hose leak at loading arm', 'Slip at control room stairs']), kind: pick(['Near miss', 'Near miss', 'First aid', 'Spill', 'Fire']), area: pick(['Tank farm Merak', 'Acid plant', 'Loading bay', 'Laboratory']), severity: pick(['Low', 'Low', 'Medium', 'High']), date: day(-150, 0) }),
  },
  'tfm.tanks': {
    count: TANKS.length,
    make: ({ i }) => {
      const t = TANKS[i] ?? TANKS[0]!
      return { tank: t.id.toUpperCase(), product: t.product, capacity: t.capacity, level: t.level, reorderAt: t.reorderAt, supplier: t.supplier }
    },
  },
  'tfm.recons': {
    count: 18,
    make: ({ int, ref }) => {
      const book = int(400, 3000)
      return { tank: ref('tfm.tanks'), book, measured: Math.round(book * (0.985 + int(0, 30) / 1000)) }
    },
  },
  'gtr.lots': {
    count: LOTS.length,
    make: ({ i }) => {
      const l = LOTS[i] ?? LOTS[0]!
      return { lotNo: l.id, product: l.product, produced: l.produced, qty: l.qty }
    },
  },
  'gtr.recalls': {
    count: 2,
    make: ({ i, ref }) =>
      i === 0
        ? { lot: ref('gtr.lots'), reason: 'Ammonia assay below spec, possible water ingress in T-101.', customers: 2, kind: 'Real recall', shipped: 48, recovered: 41 }
        : { lot: ref('gtr.lots'), reason: 'Quarterly mock recall drill on an acid lot.', customers: 3, kind: 'Mock recall', shipped: 62, recovered: 62 },
  },
}

/** Fixed status for seeded rows whose state the other screens rely on. */
const PINNED: Record<string, (values: Values) => string | undefined> = {
  // Administration rows stay in force, except the delegation that already ended.
  'sys.matrix': () => 'active',
  'fbl.quotelines': () => 'active',
  // A task that breaks hazard segregation cannot be confirmed, so it waits in progress.
  'wms.tasks': (v) => (v.segregation === 'Compatible' ? undefined : 'progress'),
  'tms.telemetry': (v) => (v.alarm === 'Alarm' ? 'logged' : undefined),
  'sys.levels': () => 'active',
  'sys.permissions': () => 'active',
  'sys.roles': () => 'active',
  'sys.delegations': (v) => (String(v.to) < '2026-10-30' ? 'revoked' : 'active'),
  // Only the newest permits still have JSA steps waiting for review.
  'she.jsa': (v) => (Number(String(v.permit).slice(-4)) >= 11 ? undefined : 'reviewed'),
  'she.licences': (v) => (String(v.expiry) < '2026-10-30' ? 'expired' : String(v.expiry) < '2026-12-30' ? 'renewal' : 'valid'),
  // Recent work still sits in the approval round, so every approver level has something to sign.
  'she.permits': (v) => (String(v.start) >= '2026-10-29' ? 'requested' : String(v.start) >= '2026-10-27' ? 'active' : undefined),
  'hrs.leaves': (v) => (String(v.from) >= '2026-10-25' ? 'submitted' : undefined),
  'vms.orders': (v) => (String(v.delivery) >= '2026-11-20' ? 'submitted' : undefined),
  'hrs.payroll': (v) => (v.period === '2026-10' ? 'calculated' : 'paid'),
  'hrs.attendance': (v) => (v.date === '2026-10-30' ? 'recorded' : 'verified'),
  'she.incidents': (v) => (String(v.date) >= '2026-10-15' ? 'reported' : undefined),
  'gtr.lots': (v) => LOTS.find((l) => l.id === v.lotNo)?.state,
  'tfm.tanks': () => 'online',
  'gtr.recalls': () => 'notified',
  // Fresh check-ins and safety events still wait for a reviewer.
  'tms.checkins': (v) => (String(v.date) >= '2026-10-29' ? 'submitted' : undefined),
  'tms.safety': (v) => (Number(v.speed) % 5 === 0 ? 'new' : undefined),
  // A live command centre: most alarms from the last few days are still being handled.
  'occ.alarms': (v) => ['new', 'new', 'acknowledged', 'assigned', 'resolved', 'closed'][Number(v.reading) % 6],
  'occ.sources': (v) => (String(v.name).includes('Lampung') ? 'planned' : String(v.name).includes('Merak') ? 'degraded' : 'connected'),
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)

/** Mostly finished work for older rows, open work for recent ones. */
function statusFor(type: RecordType, ageDays: number, r: () => number) {
  const states = type.workflow.states.map((s) => s.id)
  if (type.workflow.initial === 'active' || states.length === 2) return r() < 0.85 ? states[0]! : states[1]!
  const ends = states.filter((s) => /rejected|cancelled|expired|down|recalled|retired/.test(s))
  const path = states.filter((s) => !ends.includes(s))
  if (ends.length && r() < 0.08) return ends[0]!
  const progress = Math.min(1, ageDays / 90 + r() * 0.35)
  return path[Math.min(path.length - 1, Math.floor(progress * path.length))] ?? type.workflow.initial
}

/** Record types ordered so every type comes after the types its ref fields point at. */
function seedOrder() {
  const done = new Set<string>()
  const order = []
  let left = [...RECORD_TYPES]
  while (left.length) {
    const ready = left.filter((t) => t.fields.every((f) => f.type !== 'ref' || f.ref === t.key || done.has(f.ref ?? '')))
    if (!ready.length) throw new Error(`Circular refs among ${left.map((t) => t.key).join(', ')}`)
    for (const t of ready) done.add(t.key)
    order.push(...ready)
    left = left.filter((t) => !done.has(t.key))
  }
  return order
}

export function seedRecords(today: string): Record<string, ErpRecord[]> {
  const all: Record<string, ErpRecord[]> = {}
  const base = new Date(`${today}T08:00:00Z`).getTime()
  const iso = (days: number) => new Date(base + days * 86_400_000).toISOString()
  for (const type of seedOrder()) {
    const seed = SEEDS[type.key]
    if (!seed) continue
    const r = rng(hash(type.key))
    const ctx: Ctx = {
      i: 0,
      r,
      pick: (xs) => xs[Math.floor(r() * xs.length)] as (typeof xs)[number],
      int: (min, max) => min + Math.floor(r() * (max - min + 1)),
      day: (from, to) => iso(from + Math.floor(r() * (to - from + 1))).slice(0, 10),
      ref: (key) => {
        const rows = all[key] ?? []
        return rows[Math.floor(r() * rows.length)]?.id ?? ''
      },
    }
    all[type.key] = Array.from({ length: seed.count }, (_, i) => {
      ctx.i = i
      const values = computeValues(type, seed.make(ctx))
      const age = Math.floor(r() * 170)
      const status = PINNED[type.key]?.(values) ?? statusFor(type, age, r)
      const created = iso(-age)
      const label = type.workflow.states.find((s) => s.id === status)?.label ?? status
      return {
        id: `${type.prefix}-${String(i + 1).padStart(4, '0')}`,
        type: type.key,
        status,
        values,
        createdAt: created,
        updatedAt: iso(-Math.floor(age / 2)),
        history: [
          { at: created, by: 'Data migration', action: 'Created' },
          ...(status !== type.workflow.initial ? [{ at: iso(-Math.floor(age / 2)), by: 'Data migration', action: `Moved to ${label}` }] : []),
        ],
      }
    })
  }
  return all
}
