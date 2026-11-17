import { aging } from '@/domain/kpi'
import { balanceSheet, budgetVsActual, cashFlow, generalLedger, incomeStatement, subledgerTie, trialBalance, type Balance, type Scope } from '@/domain/ledger'
import { assetValue } from '@/domain/maintenance'
import type { ErpRecord } from '@/domain/records'
import { money } from '@/lib/format'

type All = Readonly<Record<string, readonly ErpRecord[]>>

export const REPORTS = [
  { value: 'tb', label: 'Neraca saldo' },
  { value: 'gl', label: 'Buku besar' },
  { value: 'bs', label: 'Neraca' },
  { value: 'pl', label: 'Laba rugi' },
  { value: 'cf', label: 'Arus kas' },
  { value: 'aging', label: 'Umur piutang dan utang' },
  { value: 'assets', label: 'Aset tetap' },
  { value: 'budget', label: 'Anggaran vs aktual' },
  { value: 'tie', label: 'Buku pembantu' },
] as const
export type ReportId = (typeof REPORTS)[number]['value']

export interface ReportRow {
  cells: readonly string[]
  /** `head` starts a section, `total` closes one, `grand` is the bottom line. */
  kind?: 'head' | 'total' | 'grand'
  /** Where the row drills to. */
  to?: string
}
export interface Report {
  title: string
  note: string
  columns: readonly string[]
  /** Columns from this index on hold numbers and align right. */
  numericFrom: number
  rows: ReportRow[]
}

const name = (a: ErpRecord) => `${String(a.values.code)} ${String(a.values.name)}`
const glLink = (accountId: string, q: string) => `/finance/reports?tab=gl&account=${accountId}${q}`
const journalLink = (id: string) => `/modules/fin/journals/${id}`

/** One table per report: the same rows feed the screen, the CSV export and the print view. */
export function buildReport(id: ReportId, all: All, scope: Scope, opts: { account?: string; today: string; query: string }): Report {
  const q = opts.query
  const accountRows = (rows: readonly Balance[]): ReportRow[] => rows.map((r) => ({ cells: [name(r.account), money(r.balance)], to: glLink(r.account.id, q) }))
  const period = `${scope.from ?? 'awal'} s.d. ${scope.to ?? opts.today}`

  if (id === 'tb') {
    const tb = trialBalance(all, scope)
    return {
      title: 'Neraca saldo', note: period, columns: ['Akun', 'Debit', 'Kredit', 'Saldo'], numericFrom: 1,
      rows: [...tb.rows.map((r) => ({ cells: [name(r.account), money(r.debit), money(r.credit), money(r.balance)], to: glLink(r.account.id, q) })), { cells: ['Jumlah', money(tb.debit), money(tb.credit), tb.debit === tb.credit ? 'Seimbang' : 'Selisih'], kind: 'grand' }],
    }
  }
  if (id === 'gl') {
    const gl = generalLedger(all, opts.account ?? '', scope)
    return {
      title: gl.account ? `Buku besar ${name(gl.account)}` : 'Buku besar', note: gl.account ? period : 'Pilih akun untuk melihat mutasinya.', columns: ['Tanggal', 'Jurnal', 'Keterangan', 'Debit', 'Kredit', 'Saldo'], numericFrom: 3,
      rows: gl.account
        ? [
            { cells: ['', '', 'Saldo awal', '', '', money(gl.opening)], kind: 'head' },
            ...gl.rows.map((r) => ({ cells: [r.date, r.journal.id, String(r.journal.values.description), r.debit ? money(r.debit) : '', r.credit ? money(r.credit) : '', money(r.running)], to: journalLink(r.journal.id) })),
            { cells: ['', '', 'Saldo akhir', '', '', money(gl.closing)], kind: 'grand' },
          ]
        : [],
    }
  }
  if (id === 'bs') {
    const bs = balanceSheet(all, scope)
    return {
      title: 'Neraca', note: `Per ${scope.to ?? opts.today}`, columns: ['Akun', 'Saldo'], numericFrom: 1,
      rows: [
        { cells: ['Aset', ''], kind: 'head' }, ...accountRows(bs.assets.rows), { cells: ['Jumlah aset', money(bs.assets.total)], kind: 'total' },
        { cells: ['Liabilitas', ''], kind: 'head' }, ...accountRows(bs.liabilities.rows), { cells: ['Jumlah liabilitas', money(bs.liabilities.total)], kind: 'total' },
        { cells: ['Ekuitas', ''], kind: 'head' }, ...accountRows(bs.equity.rows), { cells: ['Laba berjalan', money(bs.earnings)] }, { cells: ['Jumlah ekuitas', money(bs.equity.total + bs.earnings)], kind: 'total' },
        { cells: [bs.balanced ? 'Liabilitas dan ekuitas (seimbang dengan aset)' : 'Liabilitas dan ekuitas (TIDAK seimbang)', money(bs.funding)], kind: 'grand' },
      ],
    }
  }
  if (id === 'pl') {
    const pl = incomeStatement(all, scope)
    return {
      title: 'Laba rugi', note: period, columns: ['Akun', 'Jumlah'], numericFrom: 1,
      rows: [
        { cells: ['Pendapatan', ''], kind: 'head' }, ...accountRows(pl.revenue.rows), { cells: ['Jumlah pendapatan', money(pl.revenue.total)], kind: 'total' },
        { cells: ['Harga pokok penjualan', ''], kind: 'head' }, ...accountRows(pl.cogs.rows), { cells: ['Laba kotor', money(pl.gross)], kind: 'total' },
        { cells: ['Beban operasi', ''], kind: 'head' }, ...accountRows(pl.opex.rows), { cells: ['Jumlah beban operasi', money(pl.opex.total)], kind: 'total' },
        { cells: ['Laba bersih', money(pl.net)], kind: 'grand' },
      ],
    }
  }
  if (id === 'cf') {
    const cf = cashFlow(all, scope)
    return {
      title: 'Arus kas', note: period, columns: ['Aktivitas', 'Jumlah'], numericFrom: 1,
      rows: [
        { cells: ['Kas dan bank awal periode', money(cf.opening)], kind: 'head' },
        { cells: ['Arus kas dari operasi', money(cf.flows.operating)] },
        { cells: ['Arus kas dari investasi', money(cf.flows.investing)] },
        { cells: ['Arus kas dari pendanaan', money(cf.flows.financing)] },
        { cells: ['Kenaikan (penurunan) kas', money(cf.change)], kind: 'total' },
        { cells: ['Kas dan bank akhir periode', money(cf.closing)], kind: 'grand' },
      ],
    }
  }
  if (id === 'aging') {
    const open = (key: string) => (all[key] ?? []).filter((r) => r.status !== 'paid' && (!scope.entity || r.values.entity === scope.entity))
    const block = (title: string, key: string): ReportRow[] => {
      const buckets = aging(open(key), 'due', 'amount', opts.today)
      return [{ cells: [title, '', ''], kind: 'head' }, ...buckets.map((b) => ({ cells: [b.label, String(b.count), money(b.amount)], to: `/modules/fin/${key.split('.')[1]}` })), { cells: ['Jumlah', String(buckets.reduce((s, b) => s + b.count, 0)), money(buckets.reduce((s, b) => s + b.amount, 0))], kind: 'total' }]
    }
    return { title: 'Umur piutang dan utang', note: `Per ${opts.today}, dokumen yang belum lunas`, columns: ['Umur', 'Dokumen', 'Nilai'], numericFrom: 1, rows: [...block('Piutang pelanggan', 'fin.receivables'), ...block('Utang pemasok', 'fin.payables')] }
  }
  if (id === 'assets') {
    const rows = (all['fin.assets'] ?? []).filter((a) => a.status === 'active' && (!scope.entity || a.values.entity === scope.entity)).map((a) => ({ a, cost: Number(a.values.cost) || 0, ...assetValue((Number(a.values.cost) || 0) - (Number(a.values.salvage) || 0), String(a.values.acquired), Number(a.values.life) || 1, 0, opts.today) }))
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      title: 'Daftar aset tetap', note: `Per ${opts.today}, penyusutan garis lurus`, columns: ['Aset', 'Kelas', 'Perolehan', 'Umur', 'Harga perolehan', 'Akumulasi penyusutan', 'Nilai buku'], numericFrom: 4,
      rows: [...rows.map((r) => ({ cells: [`${r.a.id} ${String(r.a.values.name)}`, String(r.a.values.class), String(r.a.values.acquired), `${r.ageYears.toFixed(1)} / ${String(r.a.values.life)} th`, money(r.cost), money(r.depreciation), money(r.cost - r.depreciation)], to: `/modules/fin/assets/${r.a.id}` })), { cells: ['Jumlah', '', '', '', money(sum((r) => r.cost)), money(sum((r) => r.depreciation)), money(sum((r) => r.cost - r.depreciation))], kind: 'grand' }],
    }
  }
  if (id === 'tie') {
    const rows = subledgerTie(all, scope.entity)
    const unit: Record<string, string> = { holding: 'Kantor Pusat', logistics: 'Unit Logistik', fertiliser: 'Pabrik Pupuk', chemicals: 'Pabrik Kimia' }
    return {
      title: 'Buku pembantu terhadap buku besar', note: `Per ${opts.today}: faktur terbuka terhadap akun kontrol`, columns: ['Unit dan akun', 'Buku besar', 'Buku pembantu', 'Selisih'], numericFrom: 1,
      rows: [...rows.map((r) => ({ cells: [`${unit[r.entity]} · ${r.code} ${r.label}`, money(r.ledger), money(r.subledger), r.difference ? money(r.difference) : 'Cocok'], to: `/modules/fin/${r.code === '1210' ? 'receivables' : 'payables'}` })), { cells: ['Jumlah selisih', '', '', money(rows.reduce((s, r) => s + Math.abs(r.difference), 0))], kind: 'grand' }],
    }
  }
  const year = Number((scope.to ?? opts.today).slice(0, 4))
  const lines = budgetVsActual(all, year, scope.entity)
  const total = (f: (l: (typeof lines)[number]) => number) => lines.reduce((s, l) => s + f(l), 0)
  return {
    title: `Anggaran vs aktual ${year}`, note: 'Aktual dari jurnal yang sudah diposting', columns: ['Akun', 'Anggaran', 'Aktual', 'Sisa', 'Terpakai'], numericFrom: 1,
    rows: [...lines.map((l) => ({ cells: [name(l.account), money(l.budget), money(l.actual), money(l.variance), `${Math.round(l.used * 100)}%`], to: glLink(l.account.id, q) })), { cells: ['Jumlah', money(total((l) => l.budget)), money(total((l) => l.actual)), money(total((l) => l.variance)), `${Math.round((total((l) => l.actual) / Math.max(1, total((l) => l.budget))) * 100)}%`], kind: 'grand' }],
  }
}
