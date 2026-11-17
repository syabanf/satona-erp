/**
 * Treasury rules on top of the ledger: matching bank statement lines to posted bank movements, booking the lines only
 * the bank knows about, revaluing open foreign-currency invoices, and the e-Faktur export of output VAT.
 */
import { compose, fxLine, ledgerLines, POSTING, trialBalance, type Posting } from './ledger'
import type { ErpRecord } from './records'
import { baseIdr, currentRate, isForeign, ppnOf } from './tax'

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
