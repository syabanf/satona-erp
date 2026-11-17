/**
 * Treasury rules on top of the ledger: matching bank statement lines to posted bank movements, booking the lines only
 * the bank knows about, revaluing open foreign-currency invoices, and the e-Faktur export of output VAT.
 */
import { compose, fxLine, ledgerLines, POSTING, trialBalance, type Posting } from './ledger'
import { slipGross, slipNet } from './payroll'
import type { ErpRecord } from './records'
import { baseIdr, currentRate, isForeign, ppnOf, pph23Of } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>

const n = (v: unknown) => Number(v) || 0
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
const find = (all: All, type: string, id: unknown) => (all[type] ?? []).find((r) => r.id === id)

/** The ledger account of a house bank, through the bank master's GL account. */
const bankAccountOf = (all: All, bankId: unknown) => String(find(all, 'mdm.banks', bankId)?.values.glAccount ?? '')

/**
 * Unmatched statement lines of a bank, each with the posted journal that moved the same amount on its account within
 * five days and is not matched yet. Closest date wins; a journal serves one line only.
 */
export function matchSuggestions(all: All, bankId: string) {
  const account = bankAccountOf(all, bankId)
  const lines = (all['fin.statementlines'] ?? []).filter((l) => l.values.bank === bankId)
  const taken = new Set(lines.filter((l) => l.status === 'matched').map((l) => String(l.values.journal)))
  const moves = ledgerLines(all).filter((l) => l.account === account)
  return lines
    .filter((l) => l.status === 'unmatched')
    .map((line) => {
      const amount = n(line.values.amount)
      const date = String(line.values.date)
      const candidate = moves
        .filter((m) => !taken.has(m.journal.id) && m.debit - m.credit === amount && days(m.date, date) <= 5)
        .sort((a, b) => days(a.date, date) - days(b.date, date))[0]
      if (candidate) taken.add(candidate.journal.id)
      return { line, journal: candidate?.journal }
    })
}

const FEE = /biaya|administrasi|provisi/i
const INTEREST = /jasa giro|bunga/i

/**
 * Bank-only lines the treasurer can book in one click: charges as an expense, interest as other income. Any other line,
 * such as a transfer nobody can place, needs a person to find its source and gets no posting.
 */
export function bankOnlyPosting(all: All, line: ErpRecord, today: string): Posting | undefined {
  const amount = n(line.values.amount)
  const text = String(line.values.description)
  if (!(amount < 0 ? FEE : INTEREST).test(text)) return undefined
  const account = find(all, 'mdm.accounts', bankAccountOf(all, line.values.bank))
  const bank = String(account?.values.code ?? POSTING.bank)
  const head = { description: String(line.values.description), entity: 'holding', date: today, source: 'Bank', reference: line.id }
  return amount < 0 ? compose(all, head, [[POSTING.bankFee, -amount, 0], [bank, 0, -amount]], line.id) : compose(all, head, [[bank, amount, 0], [POSTING.sales.holding!, 0, amount]], line.id)
}

/** Statement balance against ledger balance for the bank account, with what the unmatched lines explain. */
export function bankReconciliation(all: All, bankId: string) {
  const account = bankAccountOf(all, bankId)
  const lines = (all['fin.statementlines'] ?? []).filter((l) => l.values.bank === bankId)
  const since = lines.map((l) => String(l.values.date)).sort()[0] ?? ''
  const ledger = ledgerLines(all, { from: since }).filter((l) => l.account === account).reduce((s, l) => s + l.debit - l.credit, 0)
  const statement = lines.reduce((s, l) => s + n(l.values.amount), 0)
  const unmatched = lines.filter((l) => l.status === 'unmatched')
  return { since, statement, ledger, difference: statement - ledger, matched: lines.length - unmatched.length, unmatched: unmatched.length }
}

/**
 * Revaluation of open foreign-currency invoices to today's rate, one journal per unit. The control accounts keep the
 * booked rupiah, so they still tie to the invoices; the difference sits in the exchange-adjustment accounts. Each run
 * trues those accounts up to what the open invoices are worth today, so running twice posts nothing and an invoice paid
 * since the last run releases its adjustment.
 */
export function fxRevaluation(all: All, today: string): Posting[] {
  const fx = all['epm.fx'] ?? []
  const change = (r: ErpRecord) => {
    const rate = currentRate(fx, String(r.values.currency))
    return rate ? baseIdr({ ...r.values, rate }) + ppnOf({ ...r.values, rate }) - baseIdr(r.values) - ppnOf(r.values) : 0
  }
  const open = (type: string, statuses: readonly string[], unit: string) => (all[type] ?? []).filter((r) => statuses.includes(r.status) && r.values.entity === unit && isForeign(r.values)).reduce((s, r) => s + change(r), 0)
  return ['holding', 'logistics', 'fertiliser', 'chemicals'].flatMap((unit) => {
    const balance = new Map(trialBalance(all, { entity: unit, to: today }).rows.map((r) => [String(r.account.values.code), r.balance]))
    // Both deltas are what the unit gains: a receivable worth more, a payable worth less.
    const receivable = open('fin.receivables', ['issued', 'overdue'], unit) - (balance.get(POSTING.receivableFx) ?? 0)
    const payable = open('fin.payables', ['received', 'matched', 'approved'], unit) - (balance.get(POSTING.payableFx) ?? 0)
    const gain = receivable - payable
    if (!receivable && !payable) return []
    const lines: Array<readonly [string, number, number]> = [
      [POSTING.receivableFx, Math.max(0, receivable), Math.max(0, -receivable)],
      [POSTING.payableFx, Math.max(0, -payable), Math.max(0, payable)],
      fxLine(-gain),
    ]
    return compose(all, { description: `Revaluasi kurs ${today}`, entity: unit, date: today, source: 'Revaluation', reference: `REVAL/${today}/${unit}` }, lines, `Revaluasi ${today}`) ?? []
  })
}

const FREQUENCY_MONTHS: Record<string, number> = { Monthly: 1, Quarterly: 3, Yearly: 12 }

/** Recurring journal templates due today or earlier, each with its journal and the date of its next run. */
export function recurringDue(all: All, today: string) {
  return (all['fin.recurring'] ?? []).flatMap((template) => {
    const v = template.values
    const due = String(v.nextRun)
    if (template.status !== 'active' || !due || due > today) return []
    const codeOf = (id: unknown) => String(find(all, 'mdm.accounts', id)?.values.code ?? '')
    const posting = compose(all, { description: String(v.description), entity: String(v.entity), date: due, source: 'Manual', reference: `${template.id}/${due}` }, [[codeOf(v.debit), n(v.amount), 0], [codeOf(v.credit), 0, n(v.amount)]], template.id)
    const d = new Date(`${due}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + (FREQUENCY_MONTHS[String(v.frequency)] ?? 1))
    return posting ? [{ template, posting, next: d.toISOString().slice(0, 10) }] : []
  })
}

/** Output VAT invoices in the column order of the e-Faktur import file, one row per approved or drafted tax invoice. */
export function efakturRows(all: All): Array<Array<string | number>> {
  const header = ['FK', 'KD_JENIS_TRANSAKSI', 'FG_PENGGANTI', 'NOMOR_FAKTUR', 'MASA_PAJAK', 'TAHUN_PAJAK', 'TANGGAL_FAKTUR', 'NPWP', 'NAMA', 'JUMLAH_DPP', 'JUMLAH_PPN', 'REFERENSI']
  const rows = (all['fin.taxinvoices'] ?? [])
    .filter((t) => t.status !== 'cancelled' && String(t.values.tax).startsWith('PPN'))
    .map((t) => {
      const invoice = find(all, 'fin.receivables', t.values.invoice)
      const partner = find(all, 'mdm.partners', invoice?.values.customer)
      const date = (invoice?.createdAt ?? t.createdAt).slice(0, 10)
      return ['FK', '01', '0', String(t.values.number).replace(/\D/g, ''), Number(date.slice(5, 7)), Number(date.slice(0, 4)), date.split('-').reverse().join('/'), String(partner?.values.npwp ?? '000000000000000'), String(partner?.values.name ?? ''), Math.round(n(t.values.base)), Math.round(n(t.values.amount)), String(invoice?.values.invoiceNo ?? '')]
    })
  return [header, ...rows]
}

/** Rows of a bulk transfer file: one beneficiary per line with account, amount and remark. */
type TransferRow = [name: string, account: string, amount: number, remark: string]
const transferFile = (rows: readonly TransferRow[]) => [['No', 'Nama penerima', 'Rekening tujuan', 'Jumlah', 'Berita'], ...rows.map((r, i) => [i + 1, ...r]), ['', 'Jumlah', '', rows.reduce((s, r) => s + r[2], 0), `${rows.length} transaksi`]]

/** The newest payroll period that has payslips. */
export const latestPayrollPeriod = (all: All) => (all['hrs.payslips'] ?? []).map((p) => String(p.values.period)).sort().at(-1) ?? ''

/** Salary transfers of a payroll period: net pay per employee to their payroll account. */
export function payrollTransfer(all: All, period: string) {
  return transferFile((all['hrs.payslips'] ?? []).filter((p) => p.values.period === period).map((p) => {
    const e = find(all, 'mdm.employees', p.values.employee)
    return [String(e?.values.name ?? p.values.employee), String(e?.values.bankAccount ?? ''), slipNet(p.values), `Gaji ${period}${p.values.kind === 'THR' ? ' THR' : ''}`] as TransferRow
  }))
}

/** Vendor transfers of a payment run: what each invoice still owes, to the vendor named on it. */
export function runTransfer(all: All, run: ErpRecord, invoices: readonly ErpRecord[], due: (invoice: ErpRecord) => number) {
  return transferFile(invoices.map((i) => [String(find(all, 'mdm.partners', i.values.vendor)?.values.name ?? i.values.vendor), '', due(i), `${run.id} ${String(i.values.invoiceNo)}`] as TransferRow))
}

const tag = (name: string, value: string | number) => `<${name}>${String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${name}>`

/**
 * Withholding slips of a tax year as an e-Bupot style XML: PPh 21 per employee from the year's payslips and PPh 23 per
 * vendor invoice that was approved with withholding. The layout follows the bulk-upload idea, not DJP's exact schema.
 */
export function ebupotXml(all: All, year: string) {
  const byEmployee = new Map<string, { gross: number; tax: number }>()
  for (const p of all['hrs.payslips'] ?? []) {
    if (!String(p.values.period).startsWith(year)) continue
    const row = byEmployee.get(String(p.values.employee)) ?? { gross: 0, tax: 0 }
    byEmployee.set(String(p.values.employee), { gross: row.gross + slipGross(p.values), tax: row.tax + n(p.values.pph21) })
  }
  const pph21 = [...byEmployee].map(([id, v]) => {
    const e = find(all, 'mdm.employees', id)
    return `  <Bupot21>${tag('NIK', String(e?.values.nik ?? id))}${tag('Nama', String(e?.values.name ?? ''))}${tag('StatusPTKP', String(e?.values.ptkp ?? 'TK/0'))}${tag('PenghasilanBruto', v.gross)}${tag('PPhDipotong', v.tax)}</Bupot21>`
  })
  const pph23 = (all['fin.payables'] ?? []).filter((p) => ['approved', 'paid'].includes(p.status) && pph23Of(p.values) > 0).map((p) => {
    const vendor = find(all, 'mdm.partners', p.values.vendor)
    return `  <Bupot23>${tag('NPWP', String(vendor?.values.npwp ?? ''))}${tag('Nama', String(vendor?.values.name ?? ''))}${tag('NomorDokumen', String(p.values.invoiceNo))}${tag('DPP', baseIdr(p.values))}${tag('Tarif', 2)}${tag('PPhDipotong', pph23Of(p.values))}</Bupot23>`
  })
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n<Bupot tahun="${year}">\n${[...pph21, ...pph23].join('\n')}\n</Bupot>\n`, pph21: pph21.length, pph23: pph23.length }
}

/**
 * Cash for the coming weeks: today's cash and bank balance, then per week the customer invoices falling due (overdue
 * ones in the first week), vendor invoices falling due, payroll on the 25th at the last run's net pay, and on the last
 * day of each month the VAT the ledger owes.
 */
export function cashForecast(all: All, today: string, weeks = 8) {
  const tb = trialBalance(all, { to: today }).rows
  const opening = tb.filter((r) => r.account.values.kind === 'Cash and bank').reduce((s, r) => s + r.balance, 0)
  const balance = (code: string) => tb.find((r) => r.account.values.code === code)?.balance ?? 0
  const vat = Math.max(0, balance(POSTING.vatOut) - balance(POSTING.vatIn))
  const period = latestPayrollPeriod(all)
  const payroll = (all['hrs.payslips'] ?? []).filter((p) => p.values.period === period).reduce((s, p) => s + slipNet(p.values), 0)
  const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
  const due = (type: string, statuses: readonly string[], from: string, to: string, first: boolean, total: (r: ErpRecord) => number) =>
    (all[type] ?? []).filter((r) => statuses.includes(r.status) && String(r.values.due) <= to && (first || String(r.values.due) >= from)).reduce((s, r) => s + total(r), 0)
  let cash = opening
  const rows = Array.from({ length: weeks }, (_, i) => {
    const [from, to] = [day(i * 7), day(i * 7 + 6)]
    const days = Array.from({ length: 7 }, (_, d) => day(i * 7 + d))
    const receipts = due('fin.receivables', ['issued', 'overdue'], from, to, i === 0, (r) => baseIdr(r.values) + ppnOf(r.values))
    const payables = due('fin.payables', ['received', 'matched', 'approved'], from, to, i === 0, (r) => baseIdr(r.values) + ppnOf(r.values) - pph23Of(r.values))
    const monthEnd = days.some((d) => day(i * 7 + days.indexOf(d) + 1).slice(8) === '01')
    const row = { from, to, opening: cash, receipts, payables, payroll: days.some((d) => d.slice(8) === '25') ? payroll : 0, tax: monthEnd && i < 5 ? vat : 0 }
    cash = row.opening + row.receipts - row.payables - row.payroll - row.tax
    return { ...row, closing: cash }
  })
  return { opening, weeks: rows }
}
