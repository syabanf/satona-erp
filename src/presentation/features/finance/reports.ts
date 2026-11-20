import { aging } from '@/domain/kpi'
import { assetBook, balanceSheet, budgetVsActual, consolidation, costCentreSpend, cashFlow, creditedOn, generalLedger, incomeStatement, ledgerLines, POSTING, subledgerTie, trialBalance, type Balance, type Scope } from '@/domain/ledger'
import { cashForecast } from '@/domain/bank'
import { fiscalBook, OWNERSHIP } from '@/domain/controls'
import { baseIdr, docTotal, ppnOf, WITHHOLDING, withheldOf } from '@/domain/tax'
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
  { value: 'partner', label: 'Saldo per mitra' },
  { value: 'equity', label: 'Perubahan ekuitas' },
  { value: 'vat', label: 'SPT Masa PPN' },
  { value: 'wht', label: 'Pemotongan PPh' },
  { value: 'consol', label: 'Konsolidasi' },
  { value: 'cc', label: 'Pusat biaya' },
  { value: 'fiscal', label: 'Penyusutan fiskal' },
  { value: 'var', label: 'Selisih produksi' },
  { value: 'forecast', label: 'Proyeksi kas' },
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
    const rows = (all['fin.assets'] ?? []).filter((a) => a.status === 'active' && (!scope.entity || a.values.entity === scope.entity)).map((a) => ({ a, cost: Number(a.values.cost) || 0, ...assetBook(a.values, opts.today) }))
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      title: 'Daftar aset tetap', note: `Per ${opts.today}, garis lurus atau saldo menurun ganda per aset`, columns: ['Aset', 'Kelas', 'Metode', 'Umur', 'Harga perolehan', 'Akumulasi penyusutan', 'Nilai buku'], numericFrom: 4,
      rows: [...rows.map((r) => ({ cells: [`${r.a.id} ${String(r.a.values.name)}`, String(r.a.values.class), r.a.values.method === 'Declining balance' ? 'Saldo menurun' : 'Garis lurus', `${r.ageYears.toFixed(1)} / ${String(r.a.values.life)} th`, money(r.cost), money(r.accumulated), money(r.book)], to: `/modules/fin/assets/${r.a.id}` })), { cells: ['Jumlah', '', '', '', money(sum((r) => r.cost)), money(sum((r) => r.accumulated)), money(sum((r) => r.book))], kind: 'grand' }],
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
  if (id === 'partner') {
    const name = (pid: unknown) => String((all['mdm.partners'] ?? []).find((p) => p.id === pid)?.values.name ?? pid)
    const inScope = (r: ErpRecord) => !scope.entity || r.values.entity === scope.entity
    const sum = new Map<string, { ar: number; ap: number }>()
    const add = (pid: unknown, k: 'ar' | 'ap', v: number) => sum.set(String(pid), { ar: 0, ap: 0, ...sum.get(String(pid)), [k]: (sum.get(String(pid))?.[k] ?? 0) + v })
    for (const r of all['fin.receivables'] ?? []) if (['issued', 'overdue'].includes(r.status) && inScope(r)) add(r.values.customer, 'ar', baseIdr(r.values) + ppnOf(r.values) - creditedOn(all, r.id))
    for (const p of all['fin.payables'] ?? []) if (p.status === 'approved' && inScope(p)) add(p.values.vendor, 'ap', docTotal(p.values))
    const rows = [...sum].sort((a, b) => b[1].ar + b[1].ap - a[1].ar - a[1].ap)
    return {
      title: 'Saldo piutang dan utang per mitra', note: `Per ${opts.today}: faktur terbuka dan tagihan yang disetujui`, columns: ['Mitra', 'Piutang', 'Utang', 'Bersih'], numericFrom: 1,
      rows: [...rows.map(([pid, v]) => ({ cells: [name(pid), money(v.ar), money(v.ap), money(v.ar - v.ap)], to: `/modules/mdm/partners/${pid}` })), { cells: ['Jumlah', money(rows.reduce((s, r) => s + r[1].ar, 0)), money(rows.reduce((s, r) => s + r[1].ap, 0)), ''], kind: 'grand' }],
    }
  }
  if (id === 'equity') {
    const before = new Date(Date.parse(`${scope.from ?? opts.today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    const at = (to: string) => balanceSheet(all, { entity: scope.entity, to })
    const [open, close] = [at(before), at(scope.to ?? opts.today)]
    const [opening, closing, net] = [open.equity.total + open.earnings, close.equity.total + close.earnings, incomeStatement(all, scope).net]
    return {
      title: 'Perubahan ekuitas', note: period, columns: ['Uraian', 'Jumlah'], numericFrom: 1,
      rows: [
        { cells: [`Ekuitas awal per ${before}`, money(opening)], kind: 'head' },
        { cells: ['Laba bersih periode', money(net)] },
        { cells: ['Setoran modal, dividen dan penyesuaian', money(closing - opening - net)] },
        { cells: ['Ekuitas akhir', money(closing)], kind: 'grand' },
      ],
    }
  }
  if (id === 'vat') {
    const code = new Map((all['mdm.accounts'] ?? []).map((a) => [a.id, String(a.values.code)]))
    const months = new Map<string, { out: number; in: number }>()
    for (const l of ledgerLines(all, scope)) {
      const c = code.get(l.account)
      // Settlement journals move both accounts the other way; only the tax raised on invoices counts here.
      const delta = c === POSTING.vatOut ? { out: l.credit, in: 0 } : c === POSTING.vatIn ? { out: 0, in: l.debit } : undefined
      if (!delta) continue
      const m = months.get(l.date.slice(0, 7)) ?? { out: 0, in: 0 }
      months.set(l.date.slice(0, 7), { out: m.out + delta.out, in: m.in + delta.in })
    }
    const rows = [...months].sort((a, b) => a[0].localeCompare(b[0]))
    const total = (k: 'out' | 'in') => rows.reduce((s, r) => s + r[1][k], 0)
    return {
      title: 'SPT Masa PPN', note: `${period}: pajak keluaran dari faktur pelanggan, pajak masukan dari tagihan pemasok`, columns: ['Masa pajak', 'PPN keluaran', 'PPN masukan', 'Kurang (lebih) bayar'], numericFrom: 1,
      rows: [...rows.map(([m, v]) => ({ cells: [m, money(v.out), money(v.in), money(v.out - v.in)] })), { cells: ['Jumlah', money(total('out')), money(total('in')), money(total('out') - total('in'))], kind: 'grand' }],
    }
  }
  if (id === 'consol') {
    const c = consolidation(all, { from: scope.from, to: scope.to }, OWNERSHIP)
    const unit: Record<string, string> = { holding: 'Kantor Pusat', logistics: 'Unit Logistik', fertiliser: 'Pabrik Pupuk', chemicals: 'Pabrik Kimia' }
    type Key = 'assets' | 'liabilities' | 'equity' | 'revenue' | 'expense' | 'net'
    const line = (label: string, key: Key, eliminated = 0, kind?: ReportRow['kind']): ReportRow => ({ cells: [label, ...c.units.map((u) => money(u[key])), eliminated ? money(-eliminated) : '', money(c.group[key])], kind })
    return {
      title: 'Laporan konsolidasi grup', note: `${period}. Piutang dan utang antarunit dieliminasi${c.unmatched ? `; selisih antarunit ${money(c.unmatched)} perlu ditelusuri` : ''}`, columns: ['Uraian', ...c.units.map((u) => unit[u.unit]!), 'Eliminasi', 'Konsolidasi'], numericFrom: 1,
      rows: [line('Aset', 'assets', c.eliminated), line('Liabilitas', 'liabilities', c.eliminated), line('Ekuitas termasuk laba berjalan', 'equity'), { cells: ['  dari jumlah itu milik pemegang saham minoritas', ...c.units.map((u) => money(Math.round(u.equity * (1 - (OWNERSHIP[u.unit] ?? 1))))), '', money(c.minority.equity)] }, line('Liabilitas dan ekuitas', 'assets', c.eliminated, 'total'), line('Pendapatan', 'revenue', c.icSales), line('Beban', 'expense', c.icSales), line('Laba bersih', 'net', 0, 'grand'), { cells: ['Laba bersih milik pemegang saham minoritas', ...c.units.map((u) => money(Math.round(u.net * (1 - (OWNERSHIP[u.unit] ?? 1))))), '', money(c.minority.net)] }, { cells: ['Laba bersih milik grup', ...c.units.map((u) => money(Math.round(u.net * (OWNERSHIP[u.unit] ?? 1)))), '', money(c.group.net - c.minority.net)], kind: 'total' }],
    }
  }
  if (id === 'fiscal') {
    const assets = (all['fin.assets'] ?? []).filter((a) => a.status === 'active' && (!scope.entity || a.values.entity === scope.entity))
    const rows = assets.map((a) => ({ a, book: assetBook(a.values, opts.today), tax: fiscalBook(a.values, opts.today) }))
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      title: 'Penyusutan komersial dan fiskal', note: `Per ${opts.today}. Selisih nilai buku menjadi dasar pajak tangguhan`, columns: ['Aset', 'Kelompok pajak', 'Harga perolehan', 'Nilai buku komersial', 'Nilai buku fiskal', 'Selisih'], numericFrom: 2,
      rows: [...rows.map((r) => ({ cells: [`${r.a.id} ${String(r.a.values.name)}`, r.tax.group, money(Number(r.a.values.cost) || 0), money(r.book.book), money(r.tax.book), money(r.book.book - r.tax.book)], to: `/modules/fin/assets/${r.a.id}` })), { cells: ['Jumlah', '', money(sum((r) => Number(r.a.values.cost) || 0)), money(sum((r) => r.book.book)), money(sum((r) => r.tax.book)), money(sum((r) => r.book.book - r.tax.book))], kind: 'grand' }],
    }
  }
  if (id === 'cc') {
    const rows = costCentreSpend(all, scope)
    const name = (cid: string) => String((all['mdm.costcenters'] ?? []).find((c) => c.id === cid)?.values.name ?? cid)
    return {
      title: 'Beban per pusat biaya', note: `${period}: baris jurnal beban yang menyebut pusat biaya, termasuk alokasi`, columns: ['Pusat biaya', 'Beban'], numericFrom: 1,
      rows: [...rows.map((r) => ({ cells: [name(r.centre), money(r.amount)], to: `/modules/mdm/costcenters/${r.centre}` })), { cells: ['Jumlah', money(rows.reduce((s, r) => s + r.amount, 0))], kind: 'grand' }],
    }
  }
  if (id === 'var') {
    const inPeriod = (o: ErpRecord) => o.status === 'completed' && (!scope.from || String(o.values.planned) >= scope.from) && (!scope.to || String(o.values.planned) <= scope.to)
    const orders = (all['bpf.orders'] ?? []).filter(inPeriod)
    const grade = (o: ErpRecord) => String((all['bpf.formulas'] ?? []).find((f) => f.id === o.values.formula)?.values.grade ?? o.values.formula)
    const v = (o: ErpRecord, k: string) => Number(o.values[k]) || 0
    const group = (label: string, key: (o: ErpRecord) => string): ReportRow[] => {
      const keys = [...new Set(orders.map(key))].sort()
      return [{ cells: [label, '', '', '', '', '', ''], kind: 'head' }, ...keys.map((k) => {
        const list = orders.filter((o) => key(o) === k)
        const sum = (f: string) => list.reduce((s, o) => s + v(o, f), 0)
        const actual = sum('materialCost') + sum('conversionCost')
        return { cells: [k, String(list.length), sum('output').toLocaleString('id-ID'), money(actual), money(actual - sum('yieldVariance') - sum('usageVariance')), money(sum('yieldVariance')), money(sum('usageVariance'))] }
      })]
    }
    return {
      title: 'Biaya aktual terhadap standar', note: `${period}: order produksi selesai, menurut tanggal rencana. Selisih positif berarti lebih mahal dari standar`, columns: ['Kelompok', 'Order', 'Hasil (t)', 'Biaya aktual', 'Nilai standar', 'Selisih rendemen', 'Selisih pemakaian dan harga'], numericFrom: 1,
      rows: orders.length ? [...group('Per formula', grade), ...group('Per lini', (o) => String(o.values.line))] : [],
    }
  }
  if (id === 'forecast') {
    const f = cashForecast(all, opts.today)
    return {
      title: 'Proyeksi kas 8 minggu', note: `Dari saldo kas dan bank per ${opts.today}: piutang dan utang menurut jatuh tempo, gaji tanggal 25, PPN akhir bulan`, columns: ['Minggu', 'Saldo awal', 'Penerimaan piutang', 'Pembayaran utang', 'Gaji', 'Pajak', 'Saldo akhir'], numericFrom: 1,
      rows: f.weeks.map((w, i) => ({ cells: [`${w.from} s.d. ${w.to}`, money(w.opening), money(w.receipts), money(-w.payables), money(-w.payroll), money(-w.tax), money(w.closing)], kind: i === f.weeks.length - 1 ? 'grand' : undefined })),
    }
  }
  if (id === 'wht') {
    const vendor = (pid: unknown) => String((all['mdm.partners'] ?? []).find((p) => p.id === pid)?.values.name ?? pid)
    const rows = (all['fin.payables'] ?? []).filter((p) => withheldOf(p.values) > 0 && (!scope.entity || p.values.entity === scope.entity))
    return {
      title: 'Daftar pemotongan PPh', note: 'PPh 23, PPh 22 dan PPh 4(2) yang dipotong saat tagihan disetujui, disetor ke kas negara', columns: ['Tagihan', 'Pemasok', 'Jenis', 'Status', 'DPP', 'Dipotong'], numericFrom: 4,
      rows: [...rows.map((p) => ({ cells: [`${p.id} ${String(p.values.invoiceNo)}`, vendor(p.values.vendor), WITHHOLDING[String(p.values.withholding)]?.label ?? '-', ['approved', 'paid'].includes(p.status) ? 'Dipotong' : 'Belum dipotong', money(baseIdr(p.values)), money(withheldOf(p.values))], to: `/modules/fin/payables/${p.id}` })), { cells: ['Jumlah', '', '', '', money(rows.reduce((s, p) => s + baseIdr(p.values), 0)), money(rows.reduce((s, p) => s + withheldOf(p.values), 0))], kind: 'grand' }],
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
