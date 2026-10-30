/** Seed rows for the shared-services modules: HRIS, finance, inventory, purchasing execution, service desk, SHE / K3 and administration. */
import { GRADES } from '@/domain/catalog/support'
import { ROLES } from './erp'
import type { Make } from './seeds'

const ENTITIES = ['holding', 'rotama', 'rodame', 'roasi']
const id = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(4, '0')}`
const roleId = (name: string) => id('ROL', Math.max(0, ROLES.findIndex((r) => r.name === name)))

/** Org tree: [name, level, parent index, entity]. */
const ORG: ReadonlyArray<[string, string, number | null, string]> = [
  ['Board of Directors', 'Directorate', null, 'holding'],
  ['Finance Directorate', 'Directorate', 0, 'holding'],
  ['Operations Directorate', 'Directorate', 0, 'holding'],
  ['Human Capital & GA Directorate', 'Directorate', 0, 'holding'],
  ['Accounting Division', 'Division', 1, 'holding'],
  ['Treasury & Tax Division', 'Division', 1, 'holding'],
  ['Rotama Logistics Division', 'Division', 2, 'rotama'],
  ['Rodame Production Division', 'Division', 2, 'rodame'],
  ['Roasi Chemical Division', 'Division', 2, 'roasi'],
  ['SHE / K3 Department', 'Department', 2, 'holding'],
  ['HR Department', 'Department', 3, 'holding'],
  ['GA & IT Department', 'Department', 3, 'holding'],
  ['Acid Plant Section', 'Section', 8, 'roasi'],
  ['Tank Farm Section', 'Section', 8, 'roasi'],
  ['NPK Plant Section', 'Section', 7, 'rodame'],
  ['Fleet Operations Section', 'Section', 6, 'rotama'],
]
const POSITIONS = ['Plant Operator', 'Process Technician', 'Shift Supervisor', 'Area Superintendent', 'Department Manager', 'Tanker Driver', 'Lab Analyst', 'K3 Officer', 'Accountant', 'HR Generalist', 'Storekeeper', 'Maintenance Technician']
const FIRST = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Gilang', 'Hana', 'Indra', 'Joko', 'Kartika', 'Lina', 'Made', 'Nanda', 'Oki', 'Putri', 'Rizky', 'Sari', 'Teguh', 'Wulan']
const LAST = ['Saputra', 'Wijaya', 'Lestari', 'Pratama', 'Hidayat', 'Kusuma', 'Siregar', 'Nugroho', 'Harahap', 'Santoso']
const AREAS: ReadonlyArray<[string, string, number]> = [
  ['Sulfuric acid unit', 'Major hazard installation', 8],
  ['Tank farm Merak bund A', 'Major hazard installation', 9],
  ['Tank farm Gresik', 'High', 10],
  ['Loading bay Cilegon', 'High', 8],
  ['NPK granulation line', 'High', 5],
  ['Urea prilling tower', 'High', 6],
  ['QC laboratory', 'Medium', 8],
  ['Bulk warehouse Lampung', 'Medium', 7],
  ['Depot workshop Cikampek', 'Medium', 2],
  ['Head office Jakarta', 'Low', 0],
]
const month = (back: number) => {
  const d = new Date(Date.UTC(2026, 9 - back, 1))
  return d.toISOString().slice(0, 7)
}

/** Approval matrix: [rule, document, entity, min, max, levels as [role, sla h]]. */
const MATRIX: ReadonlyArray<[string, string, string, number, number, ReadonlyArray<[string, number]>]> = [
  ['PO up to Rp 500 M', 'vms.orders', 'all', 0, 500e6, [['Head of Procurement', 24]]],
  ['PO above Rp 500 M', 'vms.orders', 'all', 500e6 + 1, 0, [['Head of Procurement', 24], ['Finance Controller', 24], ['CFO / Finance Director', 48]]],
  ['Requisition up to Rp 1 B', 'vms.requisitions', 'all', 0, 1e9, [['Head of Procurement', 24]]],
  ['Requisition above Rp 1 B', 'vms.requisitions', 'all', 1e9 + 1, 0, [['Head of Procurement', 24], ['CFO / Finance Director', 48]]],
  ['Leave up to 5 days', 'hrs.leaves', 'all', 0, 5, [['HR Manager', 24]]],
  ['Leave above 5 days', 'hrs.leaves', 'all', 5.5, 0, [['HR Manager', 24], ['HR Director', 48]]],
  ['Overtime', 'hrs.overtime', 'all', 0, 0, [['HR Manager', 24]]],
  ['Payroll run', 'hrs.payroll', 'all', 0, 0, [['HR Director', 24], ['Finance Controller', 24], ['CFO / Finance Director', 24]]],
  ['Permit to work', 'she.permits', 'all', 0, 0, [['Safety Inspector', 4], ['K3 Officer', 4], ['SHE Manager', 8]]],
  ['Journal up to Rp 1 B', 'fin.journals', 'all', 0, 1e9, [['Chief Accountant', 24]]],
  ['Journal above Rp 1 B', 'fin.journals', 'all', 1e9 + 1, 0, [['Chief Accountant', 24], ['Finance Controller', 24]]],
  ['Vendor payment', 'fin.payments', 'all', 0, 0, [['Finance Controller', 24], ['CFO / Finance Director', 24]]],
  ['Scrap and disposal', 'inv.scrap', 'all', 0, 0, [['Inventory Controller', 24], ['SHE Manager', 48]]],
]
const LEVELS = MATRIX.flatMap(([, , , , , levels], rule) => levels.map(([role, sla], i) => ({ rule: id('AM', rule), level: i + 1, approver: role, sla })))

export const SUPPORT_SEEDS: Record<string, { count: number; make: Make }> = {
  'hrs.orgunits': {
    count: ORG.length,
    make: ({ i, int }) => {
      const [name, level, parent, entity] = ORG[i] ?? ORG[0]!
      return { name, level, entity, parentUnit: parent === null ? undefined : id('ORG', parent), budgetHeadcount: level === 'Section' ? int(40, 160) : int(8, 40) }
    },
  },
  'hrs.positions': {
    count: 24,
    make: ({ i, pick }) => {
      const title = POSITIONS[i % POSITIONS.length]!
      return { title, orgunit: id('ORG', 4 + (i % 12)), grade: GRADES[Math.min(5, Math.floor(i / 5))]!, k3Role: /K3|Supervisor/.test(title) ? 'Ahli K3 required' : /Operator|Driver/.test(title) ? 'SIO required' : pick(['None', 'None', 'First aider']) }
    },
  },
  'hrs.shifts': {
    count: 4,
    make: ({ i }) =>
      ([
        { name: 'Office', start: '08:00', end: '17:00', hours: 8, pattern: 'Office 5x2' },
        { name: 'Morning', start: '07:00', end: '15:00', hours: 8, pattern: '4 crew 3 shift' },
        { name: 'Afternoon', start: '15:00', end: '23:00', hours: 8, pattern: '4 crew 3 shift' },
        { name: 'Night', start: '23:00', end: '07:00', hours: 8, pattern: '4 crew 3 shift' },
      ] as const)[i]!,
  },
  'hrs.leavetypes': {
    count: 5,
    make: ({ i }) => ([['Annual leave', 12, 'Yes'], ['Sick leave', 14, 'Yes'], ['Maternity leave', 90, 'Yes'], ['Marriage leave', 3, 'Yes'], ['Unpaid leave', 30, 'No']] as const).map(([name, days, paid]) => ({ name, days, paid }))[i]!,
  },
  'hrs.attendance': {
    count: 90,
    make: ({ i, day, pick, int }) => {
      const result = pick(['On time', 'On time', 'On time', 'On time', 'On time', 'Late', 'Absent', 'On leave'])
      const late = result === 'Late'
      return { employee: id('EMP', i % 60), date: day(-Math.floor(i / 30), -Math.floor(i / 30)), shift: id('SHF', i % 4), checkIn: result === 'Absent' || result === 'On leave' ? undefined : `0${7 + Number(late)}:${String(int(0, 29) + (late ? 15 : 0)).padStart(2, '0')}`, result, method: pick(['Face recognition', 'Gate RFID', 'Mobile GPS']) }
    },
  },
  'hrs.leaves': {
    count: 26,
    make: ({ i, day, pick }) => ({ employee: id('EMP', (i * 7) % 60), leaveType: id('LVT', i % 7 === 0 ? 1 : 0), from: day(-60, 40), days: pick([1, 2, 3, 5, 7, 10]), reason: pick(['Family event', 'Hometown visit (mudik)', 'Medical recovery', 'Personal matters', 'Child school event']) }),
  },
  'hrs.overtime': {
    count: 30,
    make: ({ i, day, int, pick }) => ({ employee: id('EMP', (i * 3) % 60), date: day(-75, 0), hours: int(2, 6), reason: pick(['Reactor turnaround', 'Tanker loading backlog', 'Month-end close', 'Shutdown maintenance', 'Stock opname']) }),
  },
  'hrs.payroll': {
    count: 24,
    make: ({ i, int }) => {
      const entity = ENTITIES[i % 4]!
      const headcount = [214, 486, 1120, 742][i % 4]!
      const gross = headcount * int(9, 12) * 1e6
      return { period: month(Math.floor(i / 4)), entity, headcount, gross, deductions: Math.round(gross * 0.14) }
    },
  },
  'hrs.loans': { count: 10, make: ({ i, int, pick }) => ({ employee: id('EMP', (i * 5) % 60), purpose: pick(['Housing renovation', 'Education fee', 'Medical cost', 'Motorbike']), amount: int(5, 40) * 1e6, tenor: pick([6, 12, 18, 24]) }) },
  'hrs.contracts': {
    count: 40,
    make: ({ i, day, pick }) => {
      const kind = pick(['PKWTT (permanent)', 'PKWTT (permanent)', 'PKWT (fixed term)', 'PKWT (fixed term)', 'Outsourced', 'Internship'])
      return { employee: id('EMP', i % 60), kind, start: day(-1400, -200), end: kind.startsWith('PKWTT') ? undefined : day(-10, 120) }
    },
  },
  'hrs.candidates': {
    count: 28,
    make: ({ i, pick, int }) => ({ name: `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, position: id('JOB', i % 24), source: pick(['Job portal', 'Job portal', 'Referral', 'Campus', 'Head hunter', 'Walk in']), psychotest: int(52, 96), mcuResult: pick(['Pending', 'Fit', 'Fit', 'Fit with note', 'Unfit']) }),
  },
  'hrs.onboarding': {
    count: 24,
    make: ({ i, day, pick }) => ({ employee: id('EMP', 50 + (i % 10)), kind: i % 4 === 3 ? 'Offboarding' : 'Onboarding', task: i % 4 === 3 ? pick(['Exit interview', 'Asset return', 'Final settlement']) : pick(['K3 induction', 'PPE issued', 'Site access card', 'Laptop and email', 'BPJS registration']), due: day(-20, 20) }),
  },
  'hrs.appraisals': { count: 30, make: ({ i, int }) => ({ employee: id('EMP', i * 2 % 60), period: i < 15 ? '2026 H1' : '2025 H2', kpi: int(72, 118), safety: int(60, 100) }) },
  'hrs.trainings': {
    count: 50,
    make: ({ i, day, int, pick }) => ({ employee: id('EMP', (i * 11) % 60), course: pick(['Chemical handling & GHS', 'Chemical handling & GHS', 'Emergency response', 'Confined space entry', 'Working at height', 'LOTO', 'Defensive driving', 'ISO 9001 awareness', 'Leadership']), date: day(-170, 30), hours: int(4, 24), expiry: day(60, 700) }),
  },
  'hrs.announcements': {
    count: 6,
    make: ({ i, day }) => ({ ...[
      { title: 'Annual MCU schedule for plant crews', audience: 'Plant crews' },
      { title: 'Roasi acid plant turnaround: shift changes', audience: 'Plant crews' },
      { title: 'Year-end collective leave 24 and 26 December', audience: 'All employees' },
      { title: 'New fatigue rule for tanker drivers', audience: 'Drivers' },
      { title: 'Payroll date moves to the 25th', audience: 'All employees' },
      { title: 'Office fire drill on Friday', audience: 'Office staff' },
    ][i]!, body: 'Details are in the attached memo from Human Capital.', publish: day(-40, 10) }),
  },

  'fin.journals': {
    count: 40,
    make: ({ i, day, int, pick, ref }) => ({ description: pick(['Accrued freight Rotama', 'FX revaluation USD payables', 'Depreciation tank farm', 'Intercompany sulfur sale', 'Payroll accrual', 'Inventory write-down off-spec NPK']), entity: ENTITIES[i % 4], account: ref('mdm.accounts'), costcenter: ref('mdm.costcenters'), amount: int(40, 2400) * 1e6, date: day(-160, 0) }),
  },
  'fin.payables': {
    count: 36,
    make: ({ i, day, int, ref }) => ({ invoiceNo: `INV/${2026}/${String(4100 + i * 7)}`, vendor: ref('mdm.partners'), po: ref('vms.orders'), entity: ENTITIES[i % 4], amount: int(80, 4200) * 1e6, due: day(-40, 60) }),
  },
  'fin.receivables': {
    count: 36,
    make: ({ i, day, int, ref }) => ({ invoiceNo: `SAT/AR/${String(8800 + i * 5)}`, customer: ref('mdm.partners'), entity: ENTITIES[(i + 1) % 4], amount: int(120, 6000) * 1e6, due: day(-60, 45) }),
  },
  'fin.payments': { count: 20, make: ({ i, day, int, ref }) => ({ reference: `PAY-${String(310 + i)}`, invoice: ref('fin.payables'), bank: ref('mdm.banks'), amount: int(80, 3000) * 1e6, date: day(-90, 5) }) },
  'fin.taxinvoices': { count: 24, make: ({ i, int, pick, ref }) => ({ number: `010.${String(26 + (i % 2))}.${String(73100000 + i * 37)}`, invoice: ref('fin.receivables'), tax: pick(['PPN 11%', 'PPN 11%', 'PPN 12%', 'PPh 22', 'PPh 23']), base: int(100, 5000) * 1e6 }) },
  'fin.reconciliations': {
    count: 16,
    make: ({ i, int }) => {
      const statement = int(20, 160) * 1e9
      return { bank: id('HB', i % 8), period: month(Math.floor(i / 8)), statement, ledger: statement - (i % 3 === 0 ? int(1, 90) * 1e6 : 0) }
    },
  },
  'fin.pettycash': { count: 24, make: ({ i, day, int, pick, ref }) => ({ purpose: pick(['Lab consumables', 'Safety signage', 'Courier for permits', 'Meals for turnaround crew', 'Gas test calibration fee']), entity: ENTITIES[i % 4], costcenter: ref('mdm.costcenters'), amount: int(2, 9) * 250_000, date: day(-90, 0) }) },
  'fin.advances': { count: 14, make: ({ i, day, int, pick }) => ({ employee: id('EMP', (i * 13) % 60), purpose: pick(['Site visit Palembang', 'Vendor audit Bontang', 'Permit renewal at KLHK', 'Training in Surabaya']), amount: int(3, 25) * 1e6, settleBy: day(-20, 30) }) },
  'fin.closing': {
    count: 21,
    make: ({ i, pick }) => ({ period: id('FP', Math.floor(i / 7)), task: (['Accrue unbilled freight', 'Revalue FX balances', 'Depreciation run', 'Inventory valuation', 'Intercompany match', 'Tax provision', 'Bank reconciliation'] as const)[i % 7], owner: pick(['Chief Accountant', 'AP Officer', 'AR Officer', 'Tax Officer']) }),
  },
  'fin.assets': {
    count: 18,
    make: ({ i, int, pick }) => ({ name: pick(['Acid cooler HX-3', 'Sulfur melter', 'Storage tank T-104', 'Tanker B 9123 TRK', 'Granulator drum', 'Lab HPLC', 'Warehouse Lampung roof', 'Plant DCS servers']), entity: ENTITIES[(i + 3) % 4], class: pick(['Plant & machinery', 'Storage tanks', 'Vehicles', 'Buildings', 'IT equipment']), cost: int(2, 90) * 1e9, life: pick([5, 8, 10, 15, 20, 25]) }),
  },

  'inv.stock': {
    count: 30,
    make: ({ i, int, day }) => {
      const minimum = int(20, 200)
      return { material: id('MAT', i % 10), plant: id('PLT', 5 + (i % 6)), onHand: i % 6 === 0 ? Math.round(minimum * 0.6) : int(minimum + 20, minimum * 8), minimum, expiry: day(30, 540) }
    },
  },
  'inv.adjustments': { count: 18, make: ({ int, pick, ref }) => ({ stock: ref('inv.stock'), qty: pick([-1, -1, 1]) * int(1, 40), reason: pick(['Count difference', 'Evaporation loss', 'Spillage', 'Reclassification', 'Damaged packaging']), value: int(5, 400) * 1e6 }) },
  'inv.counts': { count: 12, make: ({ i, day, int }) => ({ plant: id('PLT', 5 + (i % 6)), scope: i % 2 ? 'Full count' : 'Cycle count: B3 class 8', date: day(-150, 20), items: int(40, 320), variance: Math.round(int(0, 28) * 10) / 100 }) },
  'inv.transfers': { count: 16, make: ({ i, int }) => ({ material: id('MAT', i % 10), from: id('PLT', 5 + (i % 3)), to: id('PLT', 8 + (i % 3)), qty: int(10, 400) }) },
  'inv.scrap': { count: 12, make: ({ i, int, pick }) => ({ material: id('MAT', i % 10), qty: Math.round(int(1, 300)) / 10, reason: pick(['Expired', 'Off-spec', 'Contaminated', 'Damaged packaging']), b3: i % 10 < 5 ? 'Yes' : 'No' }) },

  'vms.orders': {
    count: 32,
    make: ({ i, day, int, pick, ref }) => ({ title: `${pick(['Sulfur', 'Ammonia', 'Caustic soda', 'Phosphoric acid', 'KCl', 'Drums and IBC', 'Catalyst V2O5'])} supply`, requisition: ref('vms.requisitions'), vendor: ref('mdm.partners'), material: id('MAT', i % 10), qty: int(20, 900), value: (i % 4 === 0 ? int(600, 2400) : int(60, 480)) * 1e6, delivery: day(-120, 45) }),
  },
  'vms.receipts': { count: 30, make: ({ i, day, int, ref }) => ({ po: ref('vms.orders'), delivery: `SJ-${String(55100 + i * 9)}`, qty: int(20, 600), coa: i % 7 === 0 ? 'Missing' : 'Attached', date: day(-100, 0) }) },
  'vms.inspections': {
    count: 40,
    make: ({ i, int, pick, ref }) => {
      const verdict = i % 9 === 0 ? 'Fail' : 'Pass'
      return { receipt: ref('vms.receipts'), parameter: pick(['Purity', 'Moisture', 'Density', 'Colour (APHA)', 'Particle size']), result: int(10, 990) / 10, verdict }
    },
  },
  'vms.returns': { count: 6, make: ({ int, pick, ref }) => ({ receipt: ref('vms.receipts'), qty: int(2, 40), reason: pick(['Off-spec', 'Leaking drum', 'Wrong material', 'Missing COA']) }) },

  'gas.categories': {
    count: 8,
    make: ({ i }) => ([['Laptop and email', 'IT', 8], ['SAP / ERP access', 'IT', 4], ['Network and CCTV', 'IT', 6], ['Vehicle pool', 'General affairs', 24], ['Mess and canteen', 'General affairs', 24], ['Building repair', 'Facilities', 48], ['Air conditioning', 'Facilities', 24], ['BPJS and payslip', 'HR services', 24]] as const).map(([name, team, sla]) => ({ name, team, sla }))[i]!,
  },
  'gas.tickets': {
    count: 40,
    make: ({ i, pick }) => ({ title: pick(['Cannot log in to ERP', 'Laptop battery swollen', 'CCTV tank farm offline', 'Need pool car to Merak', 'AC leaking in control room', 'Payslip missing overtime', 'Printer jam QC lab', 'Badge reader gate 2 down']), category: id('TCT', i % 8), priority: pick(['Low', 'Medium', 'Medium', 'High', 'Critical']), entity: ENTITIES[i % 4], requester: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}` }),
  },
  'gas.documents': {
    count: 30,
    make: ({ i, day, pick }) => ({ title: pick(['Hot work permit procedure', 'Acid unloading work instruction', 'SDS Sulfuric acid 98%', 'SDS Liquid ammonia', 'Emergency response plan tank farm', 'LOTO procedure', 'Confined space entry SOP', 'B3 waste handling SOP', 'Driver fatigue policy']), kind: pick(['SOP', 'SOP', 'Work instruction', 'SDS', 'Emergency plan', 'Policy', 'Permit copy']), entity: ENTITIES[(i + 2) % 4], revision: `Rev ${(i % 5) + 1}`, review: day(-30, 300) }),
  },

  'she.areas': {
    count: AREAS.length,
    make: ({ i, int }) => {
      const [name, riskClass, plant] = AREAS[i] ?? AREAS[0]!
      return { name, riskClass, plant: id('PLT', plant), supervisor: `${FIRST[(i * 7) % FIRST.length]} ${LAST[i % LAST.length]}`, workers: riskClass === 'Low' ? int(80, 200) : int(12, 90) }
    },
  },
  'she.hiradc': {
    count: 30,
    make: ({ i, int, pick }) => {
      const [activity, hazard] = ([
        ['Acid tanker unloading', 'Splash of 98% sulfuric acid'],
        ['Tank entry for inspection', 'Oxygen deficiency in confined space'],
        ['Hot work on pipe rack', 'Fire near flammable vapour'],
        ['Ammonia line breaking', 'Toxic gas release'],
        ['Scaffold erection', 'Fall from height'],
        ['Forklift in warehouse', 'Struck by moving equipment'],
        ['Lab sample handling', 'Skin contact with corrosives'],
        ['Night tanker driving', 'Driver fatigue'],
      ] as const)[i % 8]!
      const severity = int(3, 5)
      return { area: id('WA', i % 10), activity, hazard, likelihood: int(2, 5), severity, control: pick(['Engineering', 'Administrative', 'PPE', 'Substitution']), residual: int(1, 2) }
    },
  },
  'she.ppe': {
    count: 10,
    make: ({ i, int }) => {
      const [name, kind, standard] = ([
        ['Safety helmet with chin strap', 'Head', 'SNI 1811'],
        ['Chemical splash goggles', 'Eye and face', 'ANSI Z87.1'],
        ['Face shield for acid', 'Eye and face', 'EN 166'],
        ['Full-face respirator ABEK', 'Respiratory', 'EN 136'],
        ['Nitrile gloves 0.4 mm', 'Hand', 'EN 374'],
        ['PVC acid suit', 'Body', 'EN 14605'],
        ['Safety boots S3', 'Foot', 'SNI 7079'],
        ['Full body harness', 'Fall arrest', 'EN 361'],
        ['SCBA set', 'Respiratory', 'EN 137'],
        ['FR coverall', 'Body', 'NFPA 2112'],
      ] as const)[i]!
      const minimum = int(10, 60)
      return { name, kind, standard, minimum, stock: i % 4 === 1 ? Math.round(minimum * 0.7) : int(minimum + 10, minimum * 5) }
    },
  },
  'she.fireequipment': { count: 30, make: ({ i, day, pick }) => ({ tag: `FX-${String(100 + i)}`, area: id('WA', i % 10), kind: pick(['APAR dry powder', 'APAR dry powder', 'APAR CO2', 'APAR foam', 'Hydrant', 'Fire monitor', 'Eye wash & shower']), capacity: pick([6, 9, 12, 25, 50]), nextService: day(-15, 180) }) },
  'she.permits': {
    count: 36,
    make: ({ i, day, int, pick }) => {
      const kind = (['Hot work', 'Confined space', 'Work at height', 'Electrical LOTO', 'Excavation', 'Line breaking'] as const)[i % 6]
      const gas = kind === 'Confined space' || kind === 'Hot work' || kind === 'Line breaking'
      return { job: pick(['Replace acid pump P-201 seal', 'Inspect tank T-104 internals', 'Weld support on pipe rack 3', 'Isolate MCC-2 for upgrade', 'Dig trench for fire water line', 'Open ammonia flange FL-12']), kind, area: id('WA', i % 10), contractor: pick(['PT Teknik Mandiri', 'In-house maintenance', 'PT Inspeksi Prima', 'PT Las Baja']), start: day(-120, 3), hours: pick([4, 8, 10, 12]), oxygen: gas ? 20 + int(0, 9) / 10 : undefined, lel: gas ? (i % 11 === 0 ? 14 : int(0, 6)) : undefined }
    },
  },
  'she.jsa': {
    count: 30,
    make: ({ i, pick }) => ({ permit: id('PTW', i % 12), ...pick([
      { step: 'Isolate and drain line', hazard: 'Residual acid under pressure', control: 'Double block and bleed, verify zero pressure' },
      { step: 'Gas test before entry', hazard: 'Toxic or low oxygen atmosphere', control: 'Calibrated 4-gas detector, standby man' },
      { step: 'Set up scaffold', hazard: 'Fall from height', control: 'Green-tagged scaffold, harness 100% tie-off' },
      { step: 'Grinding and welding', hazard: 'Sparks near hydrocarbons', control: 'Fire watch, blankets, extinguisher on hand' },
    ]) }),
  },
  'she.incidents': {
    count: 46,
    make: ({ i, day, pick }) => {
      // A realistic pyramid: many near misses, few injuries, one LTI long ago.
      const kind = i === 0 ? 'Lost time injury' : i % 23 === 5 ? 'Medical treatment' : i % 9 === 2 ? 'First aid' : i % 13 === 7 ? 'Property damage' : i % 17 === 4 ? 'Environmental spill' : 'Near miss'
      return { title: pick(['Acid drip from flange during sampling', 'Forklift reversed near pedestrian', 'Slip on wet floor in granulation', 'Hose burst at loading bay', 'Driver nodded off, DSM alarm', 'Hand cut by drum lid', 'Small ammonia smell at valve']), kind, area: id('WA', i % 10), date: i === 0 ? day(-170, -165) : day(-160, 0), person: kind === 'Near miss' ? undefined : id('EMP', i % 60), lostDays: kind === 'Lost time injury' ? 6 : 0, cause: pick(['Procedure not followed', 'Inadequate PPE', 'Equipment failure', 'Poor housekeeping', 'Chemical exposure', 'Fatigue']) }
    },
  },
  'she.observations': {
    count: 70,
    make: ({ i, day, pick }) => ({ area: id('WA', i % 10), kind: pick(['Unsafe act', 'Unsafe act', 'Unsafe condition', 'Safe behaviour']), category: pick(['PPE', 'PPE', 'Housekeeping', 'LOTO', 'Working at height', 'Chemical handling', 'Chemical handling', 'Driving', 'Ergonomics']), description: pick(['Worker without face shield at acid pump', 'Drums stacked three high', 'Lock missing on isolated breaker', 'Harness not tied off', 'Good: team stopped job for gas re-test', 'Spill kit empty']), date: day(-90, 0) }),
  },
  'she.inspections': { count: 40, make: ({ i, day, int, pick }) => ({ area: id('WA', i % 10), checklist: pick(['Monthly SHE walk', 'APAR monthly', 'Scaffold tag', 'Eye wash & shower', 'Chemical storage', 'Bund integrity']), date: day(-170, 14), score: int(68, 100), findings: int(0, 7) }) },
  'she.capa': { count: 30, make: ({ i, day, pick }) => ({ action: pick(['Install splash guard on P-201', 'Retrain loaders on LOTO', 'Add fatigue break rule', 'Replace corroded bund drain valve', 'Mark pedestrian lanes', 'Refill spill kits weekly']), incident: i % 2 ? id('SIR', i % 46) : undefined, source: pick(['Incident', 'Incident', 'Inspection', 'Audit', 'Observation', 'HIRADC review']), owner: pick(['Area superintendent', 'K3 Officer', 'Maintenance Head', 'Fleet Manager']), due: day(-30, 60) }) },
  'she.toolbox': { count: 40, make: ({ i, day, int, pick }) => ({ area: id('WA', i % 10), topic: pick(['Acid splash first aid', 'Gas test before entry', 'Heat stress', 'Line of fire', 'Fatigue on night shift', 'Using the spill kit']), date: day(-60, 7), attendees: int(6, 40) }) },
  'she.ppeissues': { count: 60, make: ({ i, day, int }) => ({ employee: id('EMP', i % 60), item: id('APD', i % 10), qty: int(1, 3), date: day(-170, 0) }) },
  'she.mcu': {
    count: 60,
    make: ({ i, day, pick }) => ({ employee: id('EMP', i % 60), kind: pick(['Annual', 'Annual', 'Annual', 'Chemical exposure', 'Pre-employment', 'Return to work']), date: day(-170, 20), result: pick(['Fit', 'Fit', 'Fit', 'Fit', 'Fit with note', 'Fit with note', 'Temporarily unfit']), nextDue: day(150, 365) }),
  },
  'she.waste': { count: 24, make: ({ i, day, int, pick, ref }) => ({ wasteCode: pick(['B105d Used oil', 'A102d Lab chemicals', 'B107d Process sludge', 'A108d Contaminated packaging', 'B109d Spent catalyst']), area: id('WA', i % 10), qty: int(5, 120) / 10, transporter: ref('mdm.partners'), date: day(-170, 0) }) },
  'she.licences': {
    count: 36,
    make: ({ i, day, pick }) => ({ employee: id('EMP', (i * 5) % 60), licence: pick(['Ahli K3 Umum', 'Ahli K3 Kimia', 'SIO Forklift', 'SIO Forklift', 'SIO Crane', 'Operator boiler', 'Petugas P3K', 'Fire warden class D']), number: `K3/${2023 + (i % 3)}/${String(4400 + i * 17)}`, expiry: day(-20, 700), issuer: 'Kemnaker RI' }),
  },

  'mdm.currencies': { count: 5, make: ({ i }) => ([['IDR', 'Indonesian rupiah', 0], ['USD', 'US dollar', 2], ['SGD', 'Singapore dollar', 2], ['EUR', 'Euro', 2], ['CNY', 'Chinese yuan', 2]] as const).map(([code, name, decimals]) => ({ code, name, decimals }))[i]! },
  'mdm.taxcodes': { count: 5, make: ({ i }) => ([['V11', 'PPN output 11%', 11], ['V12', 'PPN output 12% (luxury)', 12], ['W22', 'PPh 22 import', 2.5], ['W23', 'PPh 23 services', 2], ['V00', 'PPN exempt (subsidised fertiliser)', 0]] as const).map(([code, name, rate]) => ({ code, name, rate }))[i]! },

  'sys.roles': {
    count: ROLES.length,
    make: ({ i }) => {
      const r = ROLES[i]!
      return { name: r.name, module: r.module.toUpperCase(), department: r.department, seats: r.seats, kind: r.external ? 'Portal' : 'Internal' }
    },
  },
  'sys.permissions': {
    count: 4,
    make: ({ i }) =>
      [
        { role: roleId('Operations Director'), module: 'SHE', access: 'approve', reason: 'Signs off major-hazard permits' },
        { role: roleId('Business Analyst'), module: 'SHE', access: 'view', reason: 'Safety KPIs in the board pack' },
        { role: roleId('Plant Manager'), module: 'SHE', access: 'full', reason: 'Raises permits for Roasi units' },
        { role: roleId('Fleet Manager'), module: 'HRS', access: 'view', reason: 'Checks driver attendance and licences' },
      ][i]!,
  },
  'sys.matrix': {
    count: MATRIX.length,
    make: ({ i }) => {
      const [name, docType, entity, min, max] = MATRIX[i]!
      return { name, docType, entity, min, max }
    },
  },
  'sys.levels': { count: LEVELS.length, make: ({ i }) => LEVELS[i]! },
  'sys.delegations': {
    count: 3,
    make: ({ i, day }) =>
      [
        { fromRole: 'CFO / Finance Director', toRole: 'Financial Controller', from: day(-3, -3), to: day(10, 10), reason: 'CFO on leave for the investor roadshow' },
        { fromRole: 'SHE Manager', toRole: 'K3 Officer', from: day(-1, -1), to: day(5, 5), reason: 'SHE Manager at the KLHK audit in Jakarta' },
        { fromRole: 'HR Director', toRole: 'HR Manager', from: day(-60, -60), to: day(-45, -45), reason: 'Annual leave' },
      ][i]!,
  },
  'sys.numbering': {
    count: 8,
    make: ({ i, int }) => ([['Purchase order', 'PO/{entity}/{yyyy}/{0000}'], ['Goods receipt', 'GRN/{plant}/{yyyy}/{0000}'], ['Journal entry', 'JE/{yyyy}{mm}/{00000}'], ['Customer invoice', 'SAT/AR/{0000}'], ['Permit to work', 'PTW/{area}/{yy}/{000}'], ['Incident', 'SIR/{yyyy}/{000}'], ['Leave request', 'LV/{yyyy}/{0000}'], ['Payroll run', 'PAY/{entity}/{yyyy}{mm}']] as const).map(([docType, pattern]) => ({ docType, pattern, next: int(40, 900), reset: pattern.includes('{mm}') ? 'Monthly' : 'Yearly' }))[i]!,
  },
  'sys.settings': {
    count: 12,
    make: ({ i }) =>
      ([
        ['Group name', 'Company', 'PT Satona (Holding)'],
        ['Fiscal year starts', 'Company', 'January'],
        ['Base currency', 'Company', 'IDR'],
        ['Time zone', 'Locale', 'Asia/Jakarta (WIB)'],
        ['Date format', 'Locale', 'DD MMM YYYY'],
        ['Language', 'Locale', 'English, Bahasa Indonesia'],
        ['Password rotation', 'Security', '90 days'],
        ['Single sign-on', 'Security', 'Keycloak, MFA for approvers'],
        ['Session timeout', 'Security', '30 minutes'],
        ['Approval reminder', 'Notifications', 'Every 4 h until SLA'],
        ['Escalation after SLA', 'Notifications', 'Next level and the requester'],
        ['e-Faktur gateway', 'Integration', 'DJP Online (sandbox)'],
      ] as const).map(([name, group, value]) => ({ name, group, value }))[i]!,
  },
  'sys.holidays': {
    count: 8,
    make: ({ i }) =>
      ([
        ['Christmas Eve collective leave', '2026-12-24', 'Collective leave'],
        ['Christmas Day', '2026-12-25', 'National holiday'],
        ['Boxing Day collective leave', '2026-12-26', 'Collective leave'],
        ["New Year's Day", '2027-01-01', 'National holiday'],
        ['Roasi acid plant turnaround', '2026-11-16', 'Plant shutdown'],
        ['Isra Miraj', '2027-01-16', 'National holiday'],
        ['Chinese New Year', '2027-02-06', 'National holiday'],
        ['Rodame NPK line 2 shutdown', '2026-12-07', 'Plant shutdown'],
      ] as const).map(([name, date, kind]) => ({ name, date, kind }))[i]!,
  },
  'sys.templates': {
    count: 6,
    make: ({ i }) =>
      ([
        ['Approval requested', 'Email', 'Next approver', 'Please review {document} {id} waiting at level {level}.'],
        ['Approval overdue', 'WhatsApp', 'Approver and their manager', '{document} {id} passed its {sla} h SLA.'],
        ['Permit to work issued', 'In-app', 'Area owner and K3 Officer', 'Permit {id} for {job} is active until {end}.'],
        ['Incident reported', 'WhatsApp', 'SHE Manager and Operations Director', '{kind} at {area}: {title}.'],
        ['Licence expiring', 'Email', 'Holder and HR', 'Your {licence} expires on {expiry}.'],
        ['Payslip ready', 'In-app', 'Employee', 'Your payslip for {period} is ready.'],
      ] as const).map(([event, channel, recipients, body]) => ({ event, channel, recipients, body }))[i]!,
  },
}
