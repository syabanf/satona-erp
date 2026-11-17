/** Seed for the general ledger: a fixed chart of accounts and six months of balanced, posted journals per unit. */
import type { Values } from '@/domain/records'
import type { Make } from './seeds'

const id = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(4, '0')}`
const B = 1e9

/** [code, name, class, kind, parent code, group account index or -1]. An account with children is a header. */
const COA: ReadonlyArray<[string, string, string, string, string, number]> = [
  ['1000', 'Aset', 'Asset', 'Other asset', '', -1],
  ['1100', 'Kas dan bank', 'Asset', 'Cash and bank', '1000', -1],
  ['1110', 'Kas kecil', 'Asset', 'Cash and bank', '1100', 0],
  ['1120', 'Bank Mandiri IDR', 'Asset', 'Cash and bank', '1100', 0],
  ['1130', 'Bank BNI IDR', 'Asset', 'Cash and bank', '1100', 0],
  ['1140', 'Bank BRI IDR', 'Asset', 'Cash and bank', '1100', 0],
  ['1150', 'Bank BCA IDR', 'Asset', 'Cash and bank', '1100', 0],
  ['1160', 'Bank USD', 'Asset', 'Cash and bank', '1100', 0],
  ['1200', 'Piutang', 'Asset', 'Receivable', '1000', -1],
  ['1210', 'Piutang usaha', 'Asset', 'Receivable', '1200', 1],
  ['1215', 'Selisih kurs piutang', 'Asset', 'Receivable', '1200', 1],
  ['1220', 'Piutang antarunit', 'Asset', 'Receivable', '1200', 4],
  ['1230', 'Uang muka karyawan', 'Asset', 'Receivable', '1200', 1],
  ['1300', 'Persediaan', 'Asset', 'Inventory', '1000', -1],
  ['1310', 'Persediaan bahan baku', 'Asset', 'Inventory', '1300', 2],
  ['1320', 'Barang dalam proses', 'Asset', 'Inventory', '1300', 2],
  ['1330', 'Persediaan barang jadi', 'Asset', 'Inventory', '1300', 2],
  ['1340', 'Persediaan suku cadang', 'Asset', 'Inventory', '1300', 2],
  ['1400', 'Pajak dibayar di muka', 'Asset', 'Tax', '1000', -1],
  ['1410', 'PPN masukan', 'Asset', 'Tax', '1400', 1],
  ['1500', 'Aset tetap', 'Asset', 'Fixed asset', '1000', -1],
  ['1510', 'Mesin dan pabrik', 'Asset', 'Fixed asset', '1500', 3],
  ['1520', 'Tangki penyimpanan', 'Asset', 'Fixed asset', '1500', 3],
  ['1530', 'Kendaraan', 'Asset', 'Fixed asset', '1500', 3],
  ['1540', 'Bangunan', 'Asset', 'Fixed asset', '1500', 3],
  ['1550', 'Peralatan TI', 'Asset', 'Fixed asset', '1500', 3],
  ['1590', 'Akumulasi penyusutan', 'Asset', 'Accumulated depreciation', '1500', 3],
  ['2000', 'Liabilitas', 'Liability', 'Payable', '', -1],
  ['2100', 'Utang usaha', 'Liability', 'Payable', '2000', -1],
  ['2110', 'Utang usaha pemasok', 'Liability', 'Payable', '2100', 5],
  ['2115', 'Selisih kurs utang', 'Liability', 'Payable', '2100', 5],
  ['2120', 'Utang antarunit', 'Liability', 'Payable', '2100', 8],
  ['2130', 'Barang diterima belum ditagih', 'Liability', 'Payable', '2100', 5],
  ['2200', 'Utang pajak', 'Liability', 'Tax', '2000', -1],
  ['2210', 'PPN keluaran', 'Liability', 'Tax', '2200', 6],
  ['2220', 'Utang PPh 21', 'Liability', 'Tax', '2200', 6],
  ['2230', 'Utang PPh 23', 'Liability', 'Tax', '2200', 6],
  ['2300', 'Akrual', 'Liability', 'Accrual', '2000', -1],
  ['2310', 'Beban akrual', 'Liability', 'Accrual', '2300', 6],
  ['2320', 'Gaji terutang', 'Liability', 'Accrual', '2300', 6],
  ['2500', 'Pinjaman', 'Liability', 'Loan', '2000', -1],
  ['2510', 'Pinjaman bank', 'Liability', 'Loan', '2500', 7],
  ['3000', 'Ekuitas', 'Equity', 'Equity', '', -1],
  ['3100', 'Modal disetor', 'Equity', 'Equity', '3000', 9],
  ['3200', 'Laba ditahan', 'Equity', 'Equity', '3000', 10],
  ['4000', 'Pendapatan', 'Revenue', 'Revenue', '', -1],
  ['4100', 'Penjualan pupuk', 'Revenue', 'Revenue', '4000', 12],
  ['4200', 'Penjualan kimia', 'Revenue', 'Revenue', '4000', 13],
  ['4300', 'Pendapatan jasa angkutan', 'Revenue', 'Revenue', '4000', 14],
  ['4900', 'Pendapatan lain', 'Revenue', 'Revenue', '4000', 15],
  ['5000', 'Harga pokok penjualan', 'Expense', 'Cost of goods sold', '', -1],
  ['5100', 'HPP pupuk', 'Expense', 'Cost of goods sold', '5000', 16],
  ['5200', 'HPP kimia', 'Expense', 'Cost of goods sold', '5000', 16],
  ['5300', 'Biaya langsung angkutan', 'Expense', 'Cost of goods sold', '5000', 17],
  ['6000', 'Beban operasi', 'Expense', 'Operating expense', '', -1],
  ['6100', 'Gaji dan tunjangan', 'Expense', 'Operating expense', '6000', 19],
  ['6200', 'BBM dan energi', 'Expense', 'Operating expense', '6000', 17],
  ['6300', 'Perawatan dan perbaikan', 'Expense', 'Operating expense', '6000', 18],
  ['6400', 'Beban penyusutan', 'Expense', 'Operating expense', '6000', 20],
  ['6500', 'Utilitas', 'Expense', 'Operating expense', '6000', 18],
  ['6600', 'Administrasi dan umum', 'Expense', 'Operating expense', '6000', 19],
  ['6900', 'Beban lain', 'Expense', 'Operating expense', '6000', 21],
  ['6950', 'Rugi (laba) selisih kurs', 'Expense', 'Operating expense', '6000', 21],
]
const acc = (code: string) => id('ACC', COA.findIndex((a) => a[0] === code))
const isHeader = (code: string) => COA.some((a) => a[4] === code)

/** Ledger account of house bank `i`: the four IDR banks, then the USD account for the rest. */
export const bankAccount = (i: number) => acc(['1120', '1130', '1140', '1150'][i] ?? '1160')

interface Spec {
  description: string
  entity: string
  /** Days from today. */
  day: number
  source: string
  status: string
  lines: Array<[code: string, debit: number, credit: number]>
}

/** Unit, its size against the logistics unit, and its sales and cost-of-sales accounts. */
const UNITS: ReadonlyArray<[entity: string, scale: number, sales: string, cogs: string]> = [
  ['holding', 0.25, '4900', '5300'],
  ['logistics', 1, '4300', '5300'],
  ['fertiliser', 2.8, '4100', '5100'],
  ['chemicals', 2, '4200', '5200'],
]
const MONTHS = 6
const m = (x: number) => Math.round(x / 1e6) * 1e6

/** Opening balances, then each month's cycle per unit: sell, collect, buy, consume, pay, run payroll and close taxes. */
function buildJournals(): Spec[] {
  const out: Spec[] = []
  for (const [entity, s] of UNITS) {
    const open: Spec['lines'] = [['1120', 40 * B * s, 0], ['1210', 25 * B * s, 0], ['1310', 18 * B * s, 0], ['1330', 12 * B * s, 0], ['1510', 120 * B * s, 0], ['1590', 0, 30 * B * s], ['2110', 0, 20 * B * s], ['2510', 0, 60 * B * s], ['3100', 0, 90 * B * s], ['3200', 0, 15 * B * s]]
    out.push({ description: 'Saldo awal', entity, day: -(MONTHS * 30 + 5), source: 'Opening', status: 'posted', lines: open.map(([code, d, c]) => [code, m(d), m(c)]) })
  }
  for (let back = MONTHS - 1; back >= 0; back--) {
    for (const [entity, s, sales, cogs] of UNITS) {
      const rev = m(30 * B * s * (1 + 0.04 * (MONTHS - 1 - back)))
      const cost = m(rev * 0.55)
      const at = (k: number) => -(back * 30 + 28 - k * 3)
      // The newest month keeps two journals unposted, so the approval worklist has real work.
      const late = (status: string) => (back === 0 ? status : 'posted')
      const add = (k: number, description: string, source: string, lines: Spec['lines'], status = 'posted') => out.push({ description, entity, day: at(k), source, status, lines })
      add(0, 'Penjualan bulan berjalan', 'Receivable', [['1210', m(rev * 1.11), 0], [sales, 0, rev], ['2210', 0, m(rev * 1.11) - rev]])
      add(1, 'Pembelian bahan baku', 'Payable', [['1310', cost, 0], ['1410', m(cost * 0.11), 0], ['2110', 0, cost + m(cost * 0.11)]])
      add(2, 'Pemakaian bahan dan harga pokok', 'Manual', [[cogs, m(rev * 0.6), 0], ['1310', 0, m(rev * 0.6)]])
      add(3, 'Penerimaan dari pelanggan', 'Receipt', [['1120', m(rev * 1.0), 0], ['1210', 0, m(rev * 1.0)]])
      add(4, 'Pembayaran ke pemasok', 'Payment', [['2110', m(cost * 1.05), 0], ['1120', 0, m(cost * 1.05)]])
      add(5, 'Gaji dan tunjangan', 'Manual', [['6100', m(rev * 0.08), 0], ['1120', 0, m(rev * 0.08)]])
      add(6, 'BBM, perawatan dan utilitas', 'Manual', [['6200', m(rev * 0.03), 0], ['6300', m(rev * 0.04), 0], ['6500', m(rev * 0.01), 0], ['1120', 0, m(rev * 0.03) + m(rev * 0.04) + m(rev * 0.01)]], late('submitted'))
      add(7, 'Penyusutan aset tetap', 'Depreciation', [['6400', m((120 * B * s) / 180), 0], ['1590', 0, m((120 * B * s) / 180)]])
      add(8, 'Setoran PPN masa', 'Manual', [['2210', m(rev * 1.11) - rev, 0], ['1410', 0, m(cost * 0.11)], ['1120', 0, m(rev * 1.11) - rev - m(cost * 0.11)]], late('draft'))
    }
  }
  // One investment and one loan repayment, so the cash-flow statement has all three activities.
  out.push({ description: 'Pembelian tangki penyimpanan baru', entity: 'chemicals', day: -95, source: 'Payment', status: 'posted', lines: [['1520', 18 * B, 0], ['1120', 0, 18 * B]] })
  out.push({ description: 'Angsuran pinjaman bank', entity: 'fertiliser', day: -40, source: 'Payment', status: 'posted', lines: [['2510', 12 * B, 0], ['1120', 0, 12 * B]] })
  return out
}

const JOURNALS = buildJournals()
const LINES = JOURNALS.flatMap((j, ji) => j.lines.map(([code, debit, credit]) => ({ journal: id('JE', ji), account: acc(code), debit, credit, memo: j.description })))
/**
 * The statement of the Mandiri rupiah account for the last 40 days: every posted bank movement except each seventh one
 * (still in transit), plus three lines only the bank knows about. Older lines are already matched to their journal.
 */
const STATEMENT = [
  ...JOURNALS.flatMap((j, ji) => (j.status === 'posted' && j.day >= -40 ? j.lines.filter(([code]) => code === '1120').map(([, d, c]) => ({ day: j.day + 1, description: j.description, amount: d - c, journal: ji, matched: j.day < -14 })) : [])).filter((_, i) => i % 7 !== 6),
  { day: -9, description: 'Biaya administrasi bank', amount: -350_000, journal: -1, matched: false },
  { day: -6, description: 'Jasa giro', amount: 1_240_000, journal: -1, matched: false },
  { day: -3, description: 'Transfer masuk tanpa keterangan', amount: 18_500_000, journal: -1, matched: false },
]
/** Yearly budget share of revenue per expense account, for the budget against actual report. */
const BUDGET_SHARE: ReadonlyArray<[code: string, share: number]> = [['6100', 0.085], ['6200', 0.028], ['6300', 0.045], ['6400', 0.022], ['6500', 0.012], ['6600', 0.01]]

export const LEDGER_SEEDS: Record<string, { count: number; make: Make }> = {
  'mdm.accounts': {
    count: COA.length,
    make: ({ i }): Values => {
      const [code, name, cls, kind, parent, group] = COA[i]!
      return { code, name, class: cls, kind, parent: parent ? acc(parent) : '', postable: isHeader(code) ? 'No' : 'Yes', entity: '', groupAccount: group >= 0 ? id('GCOA', group) : '', _status: 'active' }
    },
  },
  'fin.journals': {
    count: JOURNALS.length,
    make: ({ i, day }): Values => {
      const j = JOURNALS[i]!
      return { description: j.description, entity: j.entity, date: day(j.day, j.day), source: j.source, reference: '', amount: j.lines.reduce((s, l) => s + l[1], 0), _status: j.status }
    },
  },
  'fin.journallines': { count: LINES.length, make: ({ i }): Values => LINES[i]! },
  'fin.statementlines': {
    count: STATEMENT.length,
    make: ({ i, day }): Values => {
      const s = STATEMENT[i]!
      return { bank: id('HB', 0), date: day(s.day, s.day), description: s.description, amount: s.amount, journal: s.matched ? id('JE', s.journal) : '', _status: s.matched ? 'matched' : 'unmatched' }
    },
  },
  'epm.budgetlines': {
    // FY2026 budgets are rows 5 to 8 of the budget seed, one per unit in the same order as UNITS.
    count: UNITS.length * BUDGET_SHARE.length,
    make: ({ i }): Values => {
      const u = Math.floor(i / BUDGET_SHARE.length)
      const [code, share] = BUDGET_SHARE[i % BUDGET_SHARE.length]!
      return { budget: id('BUD', 4 + u), account: acc(code), costcenter: '', amount: m(30 * B * UNITS[u]![1] * 12 * share) }
    },
  },
}
