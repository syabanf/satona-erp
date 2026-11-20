/** Seed rows for recruitment, lifecycle, performance, learning, salary structure and expense claims. */
import type { Make } from './seeds'

const id = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(4, '0')}`
const emp = (i: number) => id('EMP', i % 60)
const M = 1e6

const LOCATIONS: ReadonlyArray<[string, string, number, number, number]> = [
  ['Kantor Pusat Jakarta', 'holding', -6.2146, 106.8451, 150], ['Pool Armada Cilegon', 'logistics', -6.0025, 106.0111, 300],
  ['Pabrik Pupuk Gresik', 'fertiliser', -7.1568, 112.6555, 400], ['Pabrik Kimia Cilegon', 'chemicals', -5.9966, 105.9944, 400],
]
const COURSES: ReadonlyArray<[string, string, number, string, number]> = [
  ['Induksi K3 karyawan baru', 'Onboarding', 4, 'Yes', 12], ['Penanganan bahan kimia dan GHS', 'Safety', 6, 'Yes', 24], ['Tanggap darurat dan evakuasi', 'Safety', 4, 'Yes', 12],
  ['Anti suap dan kode etik', 'Compliance', 2, 'Yes', 12], ['Dasar proses granulasi NPK', 'Technical', 8, 'No', 0], ['Kepemimpinan lini pertama', 'Leadership', 12, 'No', 0],
  ['Perlindungan data pribadi', 'Compliance', 2, 'Yes', 24], ['Mengemudi defensif', 'Safety', 6, 'No', 24],
]
const TASKS = ['Rekonsiliasi kas harian', 'Cek stok bahan baku', 'Laporan produksi shift', 'Inspeksi APD area', 'Follow up tagihan jatuh tempo', 'Update jadwal perawatan', 'Rekap absensi tim', 'Kalibrasi timbangan']
const LEVELS = ['Low', 'Medium', 'High']

const LINES = ['Line A Gresik', 'Line B Gresik', 'Urea Palembang']
const UTILITIES: ReadonlyArray<[string, number, number]> = [['Electricity (kWh)', 42_000, 1_450], ['Natural gas (MMBTU)', 310, 98_000], ['Water (m³)', 1_900, 12_500], ['Steam (t)', 120, 310_000]]

export const PEOPLE_SEEDS: Record<string, { count: number; make: Make }> = {
  // A week of meter readings per line and utility; production orders take their energy cost from these.
  'mes.utilities': {
    count: 36,
    make: ({ i, int, day }) => {
      const [kind, qty, rate] = UTILITIES[i % 4]!
      return { date: day(-Math.floor(i / 12) - 1, -Math.floor(i / 12) - 1), line: LINES[Math.floor(i / 4) % 3], kind, qty: Math.round(qty * (0.8 + int(0, 40) / 100)), rate, _status: i < 12 ? 'logged' : 'verified' }
    },
  },
  'dms.deliveries': { count: 4, make: ({ i, int, day }) => ({ order: id('SO', i * 5 + 1), qty: int(10, 60), date: day(-12 + i * 3, -12 + i * 3), plate: `L ${8100 + i * 21} UZ`, _status: 'draft' }) },
  // One count is under way with a line per stock row; two lines already differ from the system.
  'inv.countlines': {
    count: 6,
    make: ({ i, int }) => {
      const system = int(60, 900)
      return { count: id('OPN', 0), stock: id('STK', i * 5), system, counted: i === 1 ? system - 4 : i === 4 ? system + 2 : system, unitCost: (30 + i * 9) * 100_000, _status: i < 4 ? 'counted' : 'open' }
    },
  },
  'dms.returns': { count: 4, make: ({ i, int, pick }) => ({ order: id('SO', i * 3), qty: int(2, 12), reason: pick(['Off-spec', 'Damaged bags', 'Wrong product']), disposition: i % 2 ? 'Scrap' : 'Restock', _status: ['requested', 'received', 'credited', 'requested'][i] }) },
  'dms.sellthrough': { count: 3, make: ({ i, int, day }) => ({ order: id('SO', 7 + i * 8), qty: int(5, 30), date: day(-20 + i * 5, -20 + i * 5), _status: i < 2 ? 'reported' : 'draft' }) },
  'eam.turnarounds': {
    count: 3,
    make: ({ i, day }) => ({ name: ['Turnaround Line A 2026', 'Shutdown pabrik asam Q1 2027', 'Overhaul granulator Line B'][i], scope: ['Line A Gresik', 'Pabrik asam Cilegon', 'Line B Gresik'][i], start: day([-20, 60, -120][i]!, [-20, 60, -120][i]!), end: day([10, 81, -100][i]!, [10, 81, -100][i]!), budget: [4.2e9, 9.5e9, 1.8e9][i], planned: [6, 0, 4][i], done: [2, 0, 4][i], actual: [1.35e9, 0, 1.72e9][i], _status: ['running', 'planned', 'closed'][i] }),
  },
  'wms.weighings': {
    count: 8,
    make: ({ i, int, day }) => {
      const gross = int(280, 420) / 10
      const done = i > 1
      return { direction: i % 2 ? 'Outbound' : 'Inbound', plate: `B ${9000 + i * 37} TR${'ABCDEFGH'[i]}`, receipt: '', order: '', gross, tare: done ? Math.round(gross * 0.38 * 10) / 10 : undefined, date: day(-i, -i), _status: done ? 'completed' : 'first' }
    },
  },
  'gtr.movements': {
    count: 12,
    make: ({ i, int, day }) => {
      const kind = ['Receipt', 'Consumption', 'Production', 'Shipment'][i % 4]!
      const batch = 2600 + Math.floor(i / 4)
      return { lotNo: kind === 'Receipt' || kind === 'Consumption' ? `RM-GRN-${batch}` : `FG-PRD-${batch}`, kind, material: id('MAT', kind === 'Receipt' || kind === 'Consumption' ? 0 : 7), qty: int(20, 90), document: ['GRN', 'PRD', 'PRD', 'SO'][i % 4] + `-${batch}`, date: day(-40 + i * 2, -40 + i * 2), _status: 'recorded' }
    },
  },
  'dms.subsidyclaims': { count: 4, make: ({ i, int }) => ({ period: `2026-${String(7 + i).padStart(2, '0')}`, qty: int(800, 2400), amount: int(900, 2600) * M, reference: i < 2 ? `BA-VER/${610 + i}/2026` : '', _status: ['paid', 'paid', 'verified', 'submitted'][i] }) },
  'hrs.worklocations': { count: LOCATIONS.length, make: ({ i }) => ({ name: LOCATIONS[i]![0], entity: LOCATIONS[i]![1], lat: LOCATIONS[i]![2], lng: LOCATIONS[i]![3], radius: LOCATIONS[i]![4], _status: 'active' }) },
  'hrs.grades': { count: 6, make: ({ i }) => ({ grade: `G${i + 1}`, min: (5 + i * 2.5) * M, mid: (6.5 + i * 3) * M, max: (8 + i * 3.5) * M, _status: 'active' }) },
  'hrs.courses': { count: COURSES.length, make: ({ i }) => ({ title: COURSES[i]![0], category: COURSES[i]![1], hours: COURSES[i]![2], passMark: 70, mandatory: COURSES[i]![3], validity: COURSES[i]![4], _status: 'active' }) },
  'hrs.requisitions': {
    count: 10,
    make: ({ i, int, day, pick }) => ({ title: `Tambahan ${pick(['operator', 'teknisi', 'analis lab', 'pengemudi tangki', 'akuntan'])} ${['Q4', 'shutdown', 'lini B'][i % 3]}`, position: id('JOB', i % 24), orgunit: id('ORG', 4 + (i % 12)), headcount: int(1, 6), reason: pick(['New role', 'Replacement', 'Expansion']), needBy: day(10, 90), _status: ['approved', 'approved', 'submitted', 'filled', 'draft'][i % 5] }),
  },
  'hrs.jobs': {
    count: 6,
    make: ({ i, day, pick }) => ({ title: ['Operator Pabrik NPK', 'Teknisi Instrumen', 'Analis Laboratorium', 'Pengemudi Truk Tangki B3', 'Staf Akuntansi', 'K3 Officer'][i], requisition: id('HCR', (i * 5) % 10), location: pick(['Gresik', 'Cilegon', 'Jakarta']), employmentType: pick(['Permanent', 'Fixed term']), workMode: 'On site', closing: day(5, 45), description: 'Kualifikasi dan tanggung jawab sesuai uraian jabatan.', _status: i < 4 ? 'published' : i === 4 ? 'draft' : 'closed' }),
  },
  'hrs.psikotes': {
    count: 16,
    make: ({ i, int, pick }) => {
      const state = ['reviewed', 'done', 'in_progress', 'pending'][i % 4]!
      return { candidate: id('CAN', i % 12), instrument: pick(['PAPI Kostick', 'Baum', 'DAP', 'Wartegg', 'Aritmatika']), score: state === 'pending' || state === 'in_progress' ? undefined : int(48, 96), notes: state === 'reviewed' ? 'Sesuai profil jabatan.' : '', _status: state }
    },
  },
  'hrs.offers': {
    count: 8,
    make: ({ i, int, day }) => ({ candidate: id('CAN', (i * 3) % 12), position: id('JOB', i % 24), salary: int(6, 18) * M, start: day(7, 60), _status: ['accepted', 'sent', 'submitted', 'approved', 'declined', 'draft', 'accepted', 'sent'][i] }),
  },
  'hrs.offboarding': {
    count: 6,
    make: ({ i, int, day, pick }) => {
      const state = ['completed', 'exit_interview', 'notice', 'submitted', 'completed', 'notice'][i]!
      const cleared = (k: number) => (state === 'completed' || (state === 'exit_interview' && k < 2) ? 'Cleared' : 'Pending')
      return { employee: emp(i * 9 + 5), kind: pick(['Voluntary', 'End of contract', 'Retirement']), lastDay: day(-30, 45), clearanceHr: cleared(0), clearanceIt: cleared(1), clearanceFinance: cleared(2), clearanceManager: cleared(3), severance: int(8, 60) * M, exitNotes: state === 'completed' ? 'Serah terima selesai.' : '', _status: state }
    },
  },
  'hrs.resignations': { count: 5, make: ({ i, day, pick }) => ({ employee: emp(i * 11 + 3), lastDay: day(20, 60), reason: pick(['Pindah domisili', 'Melanjutkan studi', 'Kesempatan karier lain']), _status: i < 2 ? 'submitted' : 'approved' }) },
  'hrs.profilechanges': {
    count: 8,
    make: ({ i }) => {
      const [field, proposed, previous] = ([['Tax status (PTKP)', 'K/1', 'K/0'], ['Department', 'QC', 'Production'], ['Tax status (PTKP)', 'K/2', 'K/1'], ['Department', 'Finance', 'Procurement']] as const)[i % 4]!
      return { employee: emp(i * 7 + 2), field, proposed, previous, reason: 'Perubahan data keluarga atau penempatan.', _status: i < 4 ? 'submitted' : i < 7 ? 'approved' : 'rejected' }
    },
  },
  'hrs.corrections': { count: 10, make: ({ i, day, pick }) => ({ employee: emp(i * 6), date: day(-12, -1), checkIn: `0${7 + (i % 2)}:0${i % 6}`, checkOut: `1${5 + (i % 3)}:1${i % 6}`, reason: pick(['Lupa clock in', 'Dinas luar kantor', 'Aplikasi gagal memuat', 'Lupa clock out']), _status: i < 4 ? 'submitted' : i < 8 ? 'approved' : 'rejected' }) },
  'hrs.merit': {
    count: 10,
    make: ({ i, int, day }) => {
      const current = 5_500_000 + ((i * 5) % 9) * 750_000
      return { employee: emp(i * 5), current, proposed: Math.round((current * (1 + int(4, 12) / 100)) / 50_000) * 50_000, effective: day(15, 60), reason: 'Hasil penilaian kinerja semester 2.', _status: i < 4 ? 'submitted' : i < 8 ? 'approved' : 'draft' }
    },
  },
  'hrs.expenses': {
    count: 24,
    make: ({ i, int, day, pick }) => ({ employee: emp(i * 4), category: pick(['Travel', 'Meals', 'Fuel', 'Accommodation', 'Medical', 'Other']), description: pick(['Perjalanan dinas ke Gresik', 'Makan rapat pelanggan', 'BBM kunjungan lapangan', 'Hotel audit pabrik', 'Obat dan konsultasi dokter']), amount: int(15, 480) * 10_000, date: day(-45, 0), costcenter: '', _status: ['submitted', 'approved', 'paid', 'paid', 'rejected', 'submitted'][i % 6] }),
  },
  'hrs.logbook': { count: 40, make: ({ i, int, day, pick }) => ({ employee: emp(i * 2), date: day(-Math.floor(i / 8) - 1, -Math.floor(i / 8) - 1), tasks: pick(TASKS), completion: int(60, 100), _status: i < 10 ? 'submitted' : i % 9 === 0 ? 'rejected' : 'approved' }) },
  'hrs.depttasks': { count: 18, make: ({ i, day, pick }) => ({ title: TASKS[i % TASKS.length], orgunit: id('ORG', 4 + (i % 12)), employee: emp(i * 3 + 1), recurrence: pick(['Once', 'Daily', 'Weekly', 'Monthly']), due: day(-5, 14), _status: ['pending', 'done', 'approved', 'pending', 'approved', 'rejected'][i % 6] }) },
  'hrs.reviews': { count: 30, make: ({ i, int }) => ({ employee: emp(i * 2), period: i < 15 ? '2026 Q3' : '2026 Q2', kpi: int(58, 98), behaviour: int(60, 96), contribution: int(50, 100), selfNote: 'Target utama tercapai, perlu peningkatan dokumentasi.', _status: i < 6 ? 'submitted' : i < 9 ? 'draft' : 'approved' }) },
  'hrs.feedback360': {
    count: 36,
    make: ({ i, int, pick }) => {
      const state = i % 4 === 0 ? 'pending' : i % 4 === 1 ? 'submitted' : 'approved'
      return { employee: emp(i * 5 + 1), subject: emp(i * 5 + 13), relation: pick(['Manager', 'Peer', 'Peer', 'Direct report']), score: state === 'pending' ? undefined : int(3, 5), comment: state === 'pending' ? '' : pick(['Komunikatif dan bisa diandalkan.', 'Perlu lebih proaktif berbagi informasi.', 'Tegas dan adil terhadap tim.']), _status: state }
    },
  },
  // Every employee has one course behind them and one still assigned, so the course screen always has work.
  'hrs.enrollments': {
    count: 120,
    make: ({ i, int, day }) => {
      if (i >= 60) return { employee: emp(i), course: id('CRS', (i + 3) % COURSES.length), progress: 0, _status: 'assigned' }
      const state = ['completed', 'completed', 'in_progress', 'assigned'][i % 4]!
      return { employee: emp(i), course: id('CRS', i % COURSES.length), progress: state === 'completed' ? 100 : state === 'in_progress' ? int(20, 80) : 0, score: state === 'completed' ? int(72, 98) : undefined, validUntil: state === 'completed' ? day(-20, 400) : undefined, _status: state }
    },
  },
  'hrs.succession': { count: 9, make: ({ i, pick }) => ({ position: id('JOB', i * 2), employee: emp(i * 6 + 4), readiness: pick(['Ready now', '1 to 2 years', '3 to 5 years']), potential: LEVELS[i % 3], performance: LEVELS[(i + 1 + Math.floor(i / 3)) % 3], plan: 'Rotasi lintas fungsi dan pendampingan atasan.', _status: ['planned', 'in_progress', 'done'][i % 3] }) },
}
