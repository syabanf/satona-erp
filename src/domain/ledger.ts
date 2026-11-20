/**
 * The general ledger: double-entry rules, balances and the financial statements, all read from posted journal lines.
 * Pure functions over the record store, so the same numbers drive the reports, the cockpit and the tests.
 */
import type { ErpRecord, Values } from './records'
import { baseIdr, currentRate, docTotal, isForeign, ppnOf, totalAt, WITHHOLDING, withheldOf } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>

export interface Scope {
  entity?: string
  /** Inclusive ISO dates. */
  from?: string
  to?: string
}

export interface Line {
  line: ErpRecord
  journal: ErpRecord
  account: string
  debit: number
  credit: number
  date: string
}

/** Account codes the automatic postings use; the chart of accounts seed carries every one of them. */
export const POSTING = {
  pettyCash: '1110',
  bank: '1120',
  receivable: '1210',
  advance: '1230',
  inventory: '1310',
  accumulated: '1590',
  payable: '2110',
  retained: '3200',
  sales: { fertiliser: '4100', chemicals: '4200', logistics: '4300', holding: '4900' } as Record<string, string>,
  depreciation: '6400',
  expense: '6900',
  spares: '1340',
  wip: '1320',
  finished: '1330',
  vatIn: '1410',
  vatOut: '2210',
  grir: '2130',
  pph21: '2220',
  pph23: '2230',
  vatDeferred: '1415',
  feeReceivable: '1250',
  accrual: '2310',
  cogs: { fertiliser: '5100', chemicals: '5200', logistics: '5300', holding: '5100' } as Record<string, string>,
  payroll: '6100',
  maintenance: '6300',
  bankFee: '6600',
  general: '6600',
  fx: '6950',
  receivableFx: '1215',
  subsidyReceivable: '1240',
  subsidy: '4110',
  wages: '2320',
  yieldVariance: '5410',
  usageVariance: '5420',
  countVariance: '5430',
  consignment: '1335',
  revaluation: '5440',
  scrap: '5450',
  intercompanyReceivable: '1220',
  intercompanyPayable: '2120',
  payableFx: '2115',
} as const

const num = (v: unknown) => Number(v) || 0
/** A reversed journal stays in the ledger next to the entry that undoes it, so the audit trail keeps both. */
const LEDGER_STATUSES = new Set(['posted', 'reversed'])
const DEBIT_NORMAL = new Set(['Asset', 'Expense'])
const accountsOf = (all: All) => all['mdm.accounts'] ?? []
/** An account's balance in its own direction: debits less credits for assets and expenses, the reverse for the rest. */
const natural = (account: ErpRecord | undefined, debit: number, credit: number) => (DEBIT_NORMAL.has(String(account?.values.class)) ? debit - credit : credit - debit)

/** Debit and credit totals of a set of journal lines; a journal may post only when they match and are not zero. */
export function journalBalance(lines: ReadonlyArray<{ values: Values }>) {
  const debit = lines.reduce((s, l) => s + num(l.values.debit), 0)
  const credit = lines.reduce((s, l) => s + num(l.values.credit), 0)
  return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.5 }
}

/** Why a journal cannot be submitted or posted, or undefined when it can. */
export function journalProblem(journal: ErpRecord, all: All): string | undefined {
  const lines = (all['fin.journallines'] ?? []).filter((l) => l.values.journal === journal.id)
  if (lines.length < 2) return 'Jurnal butuh minimal dua baris'
  const { debit, credit, balanced } = journalBalance(lines)
  if (!balanced) return `Jurnal tidak seimbang: debit ${debit.toLocaleString('id-ID')}, kredit ${credit.toLocaleString('id-ID')}`
  const accounts = new Map(accountsOf(all).map((a) => [a.id, a]))
  const header = lines.find((l) => accounts.get(String(l.values.account))?.values.postable === 'No')
  if (header) return `Akun ${String(accounts.get(String(header.values.account))?.values.code)} adalah akun induk dan tidak menerima posting`
  const month = String(journal.values.date).slice(0, 7)
  const companies = new Set((all['mdm.companies'] ?? []).filter((c) => c.values.entity === journal.values.entity).map((c) => c.id))
  if ((all['epm.periods'] ?? []).some((p) => p.status === 'closed' && p.values.period === month && companies.has(String(p.values.company)))) return `Periode ${month} sudah ditutup`
  return undefined
}

/** Lines of posted journals inside the scope, each with its journal's date. */
export function ledgerLines(all: All, scope: Scope = {}): Line[] {
  const journals = new Map((all['fin.journals'] ?? []).filter((j) => LEDGER_STATUSES.has(j.status) && (!scope.entity || j.values.entity === scope.entity)).map((j) => [j.id, j]))
  return (all['fin.journallines'] ?? []).flatMap((line) => {
    const journal = journals.get(String(line.values.journal))
    const date = String(journal?.values.date ?? '')
    if (!journal || (scope.from && date < scope.from) || (scope.to && date > scope.to)) return []
    return [{ line, journal, account: String(line.values.account), debit: num(line.values.debit), credit: num(line.values.credit), date }]
  })
}

export interface Balance {
  account: ErpRecord
  debit: number
  credit: number
  /** In the account's normal direction. */
  balance: number
}

/** Debit, credit and balance per account that has movement in the scope, in code order, with the grand totals. */
export function trialBalance(all: All, scope: Scope = {}) {
  const sums = new Map<string, { debit: number; credit: number }>()
  for (const l of ledgerLines(all, scope)) {
    const s = sums.get(l.account) ?? { debit: 0, credit: 0 }
    s.debit += l.debit
    s.credit += l.credit
    sums.set(l.account, s)
  }
  const rows: Balance[] = accountsOf(all)
    .filter((a) => sums.has(a.id))
    .map((account) => ({ account, ...sums.get(account.id)!, balance: natural(account, sums.get(account.id)!.debit, sums.get(account.id)!.credit) }))
    .sort((a, b) => String(a.account.values.code).localeCompare(String(b.account.values.code)))
  return { rows, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) }
}

/** One account's movements in date order with a running balance, starting from its balance before `from`. */
export function generalLedger(all: All, accountId: string, scope: Scope = {}) {
  const account = accountsOf(all).find((a) => a.id === accountId)
  const mine = ledgerLines(all, { entity: scope.entity, to: scope.to }).filter((l) => l.account === accountId)
  const before = mine.filter((l) => scope.from && l.date < scope.from)
  const opening = natural(account, before.reduce((s, l) => s + l.debit, 0), before.reduce((s, l) => s + l.credit, 0))
  let running = opening
  const rows = mine
    .filter((l) => !scope.from || l.date >= scope.from)
    .sort((a, b) => a.date.localeCompare(b.date) || a.journal.id.localeCompare(b.journal.id))
    .map((l) => ({ ...l, running: (running += natural(account, l.debit, l.credit)) }))
  return { account, opening, rows, closing: running }
}

const section = (rows: readonly Balance[], keep: (a: ErpRecord) => boolean) => {
  const mine = rows.filter((r) => keep(r.account) && Math.abs(r.balance) >= 0.5)
  return { rows: mine, total: mine.reduce((s, r) => s + r.balance, 0) }
}

/** Revenue, cost of goods sold and operating expenses for a period, with gross and net profit. */
export function incomeStatement(all: All, scope: Scope = {}) {
  const { rows } = trialBalance(all, scope)
  const revenue = section(rows, (a) => a.values.class === 'Revenue')
  const cogs = section(rows, (a) => a.values.class === 'Expense' && a.values.kind === 'Cost of goods sold')
  const opex = section(rows, (a) => a.values.class === 'Expense' && a.values.kind !== 'Cost of goods sold')
  return { revenue, cogs, opex, gross: revenue.total - cogs.total, net: revenue.total - cogs.total - opex.total }
}

/** Assets, liabilities and equity as of a date. Profit not yet closed to retained earnings shows as current earnings. */
export function balanceSheet(all: All, scope: Omit<Scope, 'from'> = {}) {
  const { rows } = trialBalance(all, scope)
  const assets = section(rows, (a) => a.values.class === 'Asset')
  const liabilities = section(rows, (a) => a.values.class === 'Liability')
  const equity = section(rows, (a) => a.values.class === 'Equity')
  const earnings = incomeStatement(all, scope).net
  const funding = liabilities.total + equity.total + earnings
  return { assets, liabilities, equity, earnings, funding, balanced: Math.abs(assets.total - funding) < 0.5 }
}

export type CashActivity = 'operating' | 'investing' | 'financing'

/**
 * Cash movements of the period by activity. A journal that touches a fixed asset is investing, one that touches a loan
 * or equity is financing, the rest is operating. Opening and closing are the cash and bank balances around the period.
 */
export function cashFlow(all: All, scope: Scope = {}) {
  const accounts = new Map(accountsOf(all).map((a) => [a.id, a]))
  const kindOf = (id: string) => String(accounts.get(id)?.values.kind)
  const isCash = (id: string) => kindOf(id) === 'Cash and bank'
  const everything = ledgerLines(all, { entity: scope.entity, to: scope.to })
  const byJournal = new Map<string, Line[]>()
  for (const l of everything) byJournal.set(l.journal.id, [...(byJournal.get(l.journal.id) ?? []), l])
  const cashIn = (lines: readonly Line[]) => lines.filter((l) => isCash(l.account)).reduce((s, l) => s + l.debit - l.credit, 0)
  const opening = cashIn(everything.filter((l) => scope.from && l.date < scope.from))
  const flows: Record<CashActivity, number> = { operating: 0, investing: 0, financing: 0 }
  for (const lines of byJournal.values()) {
    if (scope.from && lines[0]!.date < scope.from) continue
    const amount = cashIn(lines)
    if (!amount) continue
    const others = lines.filter((l) => !isCash(l.account)).map((l) => kindOf(l.account))
    const activity: CashActivity = others.some((k) => k === 'Fixed asset') ? 'investing' : others.some((k) => k === 'Loan' || k === 'Equity') ? 'financing' : 'operating'
    flows[activity] += amount
  }
  const change = flows.operating + flows.investing + flows.financing
  return { opening, flows, change, closing: opening + change }
}

/** Budget lines of the year against posted actuals per account: variance is budget less actual. */
export function budgetVsActual(all: All, year: number, entity?: string) {
  const budgets = new Set((all['epm.budgets'] ?? []).filter((b) => num(b.values.year) === year && (!entity || b.values.entity === entity)).map((b) => b.id))
  const planned = new Map<string, number>()
  for (const l of all['epm.budgetlines'] ?? []) if (budgets.has(String(l.values.budget))) planned.set(String(l.values.account), (planned.get(String(l.values.account)) ?? 0) + num(l.values.amount))
  const actual = new Map(trialBalance(all, { entity, from: `${year}-01-01`, to: `${year}-12-31` }).rows.map((r) => [r.account.id, r.balance]))
  return accountsOf(all)
    .filter((a) => planned.has(a.id))
    .map((account) => {
      const budget = planned.get(account.id) ?? 0
      const spent = actual.get(account.id) ?? 0
      return { account, budget, actual: spent, variance: budget - spent, used: budget ? spent / budget : 0 }
    })
    .sort((a, b) => String(a.account.values.code).localeCompare(String(b.account.values.code)))
}

export interface Posting {
  journal: Values
  lines: Values[]
}

/** A journal from account codes: zero lines drop out, and nothing is raised unless every account exists and debit equals credit. */
export function compose(all: All, journal: Values, lines: ReadonlyArray<readonly [code: string, debit: number, credit: number]>, memo: string): Posting | undefined {
  const used = lines.filter(([, d, c]) => d > 0 || c > 0)
  const ids = used.map(([code]) => accountsOf(all).find((a) => a.values.code === code)?.id)
  const debit = used.reduce((s, l) => s + l[1], 0)
  if (!used.length || ids.some((x) => !x) || debit !== used.reduce((s, l) => s + l[2], 0)) return undefined
  return { journal: { ...journal, amount: debit }, lines: used.map(([, d, c], i) => ({ account: ids[i]!, debit: d, credit: c, memo })) }
}

const entry = (all: All, journal: Values, debitCode: string, creditCode: string, amount: number, memo: string) => compose(all, journal, [[debitCode, amount, 0], [creditCode, 0, amount]], memo)

/** What approved credit notes took off a customer invoice, PPN included when the invoice carries it. */
export function creditedOn(all: All, invoiceId: string) {
  const invoice = (all['fin.receivables'] ?? []).find((r) => r.id === invoiceId)
  const base = (all['fin.creditnotes'] ?? []).filter((c) => c.values.invoice === invoiceId && c.status === 'approved').reduce((s, c) => s + num(c.values.amount), 0)
  return base + (invoice?.values.tax === 'PPN 11%' ? Math.round(base * 0.11) : 0)
}

/** A signed amount on an account as a journal line: positive debits it, negative credits it. */
export const signed = (code: string, amount: number): readonly [string, number, number] => [code, Math.max(0, amount), Math.max(0, -amount)]

/** An exchange difference as a journal line: a loss debits the account, a gain credits it. */
export const fxLine = (loss: number): readonly [string, number, number] => [POSTING.fx, Math.max(0, loss), Math.max(0, -loss)]

/**
 * The journal a document step raises: a customer invoice books revenue, its payment clears the receivable, an approved
 * vendor invoice books the payable, and so on. `to` is the status the document reaches; 'created' is its creation.
 */
export function postingFor(typeKey: string, record: ErpRecord, to: string, all: All, today: string): Posting | undefined {
  const v = record.values
  const head = (source: string, description: string, entity = v.entity): Values => ({ description, entity: entity ?? 'holding', date: today, source, reference: record.id })
  const bankOf = (bankId: unknown) => {
    const gl = (all['mdm.banks'] ?? []).find((b) => b.id === bankId)?.values.glAccount
    return String(accountsOf(all).find((a) => a.id === gl)?.values.code ?? POSTING.bank)
  }
  const step = `${typeKey}:${to}`
  const fx = all['epm.fx'] ?? []
  const invoiceNo = String(v.invoiceNo)
  // A customer invoice books the receivable with its PPN; the receipt clears it at today's rate and books the difference.
  if (step === 'fin.receivables:created') return compose(all, head('Receivable', `Faktur pelanggan ${invoiceNo}`), [[POSTING.receivable, baseIdr(v) + ppnOf(v), 0], [POSTING.sales[String(v.entity)] ?? POSTING.sales.holding!, 0, baseIdr(v)], [POSTING.vatOut, 0, ppnOf(v)]], invoiceNo)
  if (step === 'fin.receivables:paid') {
    const credited = creditedOn(all, record.id)
    const [booked, received] = [docTotal(v) - credited, totalAt(v, fx) - credited]
    return compose(all, head('Receipt', `Pelunasan ${invoiceNo}`), [[POSTING.bank, received, 0], [POSTING.receivable, 0, booked], fxLine(booked - received)], invoiceNo)
  }
  // A vendor invoice clears the goods-received accrual when its PO has posted receipts, and withholds PPh 23 where it applies.
  if (step === 'fin.payables:approved') {
    const receipts = new Set((all['vms.receipts'] ?? []).filter((g) => v.po && g.values.po === v.po).map((g) => g.id))
    const accrued = (all['fin.journals'] ?? []).some((j) => j.status === 'posted' && receipts.has(String(j.values.reference)))
    // Input VAT that may not be credited becomes part of the goods' cost; deferred VAT waits on its own account.
    const credit = String(v.vatCredit || 'Credited')
    const vatAccount = credit === 'Deferred' ? POSTING.vatDeferred : POSTING.vatIn
    const cost = baseIdr(v) + (credit === 'Not creditable' ? ppnOf(v) : 0)
    return compose(all, head('Payable', `Tagihan pemasok ${invoiceNo}`), [[accrued ? POSTING.grir : POSTING.inventory, cost, 0], [vatAccount, credit === 'Not creditable' ? 0 : ppnOf(v), 0], [POSTING.payable, 0, docTotal(v)], [WITHHOLDING[String(v.withholding)]?.account ?? POSTING.pph23, 0, withheldOf(v)]], invoiceNo)
  }
  if (step === 'fin.payments:approved') {
    const invoice = (all['fin.payables'] ?? []).find((p) => p.id === v.invoice)
    // The payment amount is in the invoice currency: the payable clears at the booked rate, the bank pays today's.
    const at = (rate: unknown) => Math.round(num(v.amount) * (invoice && isForeign(invoice.values) ? num(rate) || 1 : 1))
    const [booked, paid] = [at(invoice?.values.rate), at(currentRate(fx, String(invoice?.values.currency)) || invoice?.values.rate)]
    return compose(all, head('Payment', `Pembayaran ${String(v.reference)}`, invoice?.values.entity), [[POSTING.payable, booked, 0], [bankOf(v.bank), 0, paid], fxLine(paid - booked)], String(v.reference))
  }
  if (step === 'fin.pettycash:approved') {
    // The expense line carries the claim's cost centre, so departmental spend is real ledger data.
    const posting = entry(all, head('Cash', `Kas kecil: ${String(v.purpose)}`), POSTING.expense, POSTING.pettyCash, num(v.amount), String(v.purpose))
    return posting && { ...posting, lines: posting.lines.map((l, i) => (i === 0 ? { ...l, costcenter: v.costcenter } : l)) }
  }
  if (step === 'fin.advances:paid') return entry(all, head('Cash', `Uang muka: ${String(v.purpose)}`), POSTING.advance, POSTING.bank, num(v.amount), String(v.purpose))
  if (step === 'fin.advances:settled') return entry(all, head('Cash', `Pertanggungjawaban uang muka: ${String(v.purpose)}`), POSTING.expense, POSTING.advance, num(v.amount), String(v.purpose))
  return undefined
}

/** Ledger account of each fixed-asset class. */
export const ASSET_ACCOUNT: Record<string, string> = { 'Plant & machinery': '1510', 'Storage tanks': '1520', Vehicles: '1530', Buildings: '1540', 'IT equipment': '1550', 'Construction in progress': '1560' }

/**
 * Where a fixed asset stands on a date. Straight line spreads cost less salvage evenly over the useful life; double
 * declining balance charges twice the straight-line rate on the remaining book value and stops at the salvage value.
 */
export function assetBook(v: Values, today: string) {
  const [cost, salvage, life] = [num(v.cost), num(v.salvage), Math.max(1, num(v.life))]
  // Construction in progress is not in service yet, so nothing depreciates.
  if (v.class === 'Construction in progress') return { ageYears: 0, accumulated: 0, book: cost, yearly: 0 }
  // Depreciation runs by full months in service, so two years to the day is exactly two years.
  const [from, to] = [String(v.acquired || today), today]
  const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) - (to.slice(8) < from.slice(8) ? 1 : 0)
  const ageYears = Math.max(0, months) / 12
  if (v.method === 'Declining balance') {
    const rate = Math.min(1, 2 / life)
    const book = Math.max(salvage, cost * (1 - rate) ** ageYears)
    return { ageYears, accumulated: Math.round(cost - book), book: Math.round(book), yearly: Math.round(Math.min(book - salvage, book * rate)) }
  }
  const accumulated = Math.min(cost - salvage, ((cost - salvage) * ageYears) / life)
  return { ageYears, accumulated: Math.round(accumulated), book: Math.round(cost - accumulated), yearly: ageYears >= life ? 0 : Math.round((cost - salvage) / life) }
}

const referenced = (all: All, reference: string) => (all['fin.journals'] ?? []).some((j) => j.values.reference === reference && j.status !== 'rejected')

/**
 * Monthly depreciation per unit for `period` (YYYY-MM): each active asset acquired by the period end and not yet fully
 * depreciated contributes a twelfth of its yearly charge. Units that already have the period's journal are skipped.
 */
export function depreciationRun(all: All, period: string): Posting[] {
  const end = `${period}-31`
  const byEntity = new Map<string, number>()
  for (const a of all['fin.assets'] ?? []) {
    const acquired = String(a.values.acquired ?? '')
    if (a.status !== 'active' || !acquired || acquired > end) continue
    const months = (Number(period.slice(0, 4)) - Number(acquired.slice(0, 4))) * 12 + Number(period.slice(5, 7)) - Number(acquired.slice(5, 7))
    if (months >= num(a.values.life) * 12) continue
    byEntity.set(String(a.values.entity), (byEntity.get(String(a.values.entity)) ?? 0) + Math.round(assetBook(a.values, `${period}-01`).yearly / 12))
  }
  return [...byEntity].flatMap(([entity, amount]) => {
    const reference = `DEP/${period}/${entity}`
    if (referenced(all, reference)) return []
    return entry(all, { description: `Penyusutan ${period}`, entity, date: `${period}-28`, source: 'Depreciation', reference }, POSTING.depreciation, POSTING.accumulated, amount, `Penyusutan ${period}`) ?? []
  })
}

/** The year-end close of one unit: every revenue and expense balance moves to retained earnings. */
export function closingEntry(all: All, entity: string, year: number): Posting | undefined {
  const reference = `CLOSE/${year}/${entity}`
  if (referenced(all, reference)) return undefined
  const scope = { entity, from: `${year}-01-01`, to: `${year}-12-31` }
  const rows = trialBalance(all, scope).rows.filter((r) => ['Revenue', 'Expense'].includes(String(r.account.values.class)) && Math.abs(r.balance) >= 0.5)
  const retained = accountsOf(all).find((a) => a.values.code === POSTING.retained)?.id
  if (!rows.length || !retained) return undefined
  const memo = `Penutupan ${year}`
  // Reverse each balance: revenue is debited, expenses are credited; the difference is the year's profit.
  const lines: Values[] = rows.map((r) => {
    // A balance against the account's normal side (a revenue account in debit) closes on the other side.
    const debitSide = (r.account.values.class === 'Revenue') === r.balance > 0
    return { account: r.account.id, debit: debitSide ? Math.abs(r.balance) : 0, credit: debitSide ? 0 : Math.abs(r.balance), memo }
  })
  const net = incomeStatement(all, scope).net
  lines.push({ account: retained, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo })
  return { journal: { description: `Jurnal penutup ${year}`, entity, date: `${year}-12-31`, source: 'Closing', reference, amount: journalBalance(lines.map((values) => ({ values }))).debit }, lines }
}

const UNIT_IDS = ['holding', 'logistics', 'fertiliser', 'chemicals'] as const

/**
 * Control accounts against their subledgers per unit: trade receivables against open customer invoices, trade payables
 * against vendor invoices approved and not yet paid. `difference` is subledger less ledger and should be zero.
 */
export function subledgerTie(all: All, entity?: string) {
  const open = (type: string, statuses: readonly string[], unit: string, total: (v: Values) => number) => (all[type] ?? []).filter((r) => statuses.includes(r.status) && r.values.entity === unit).reduce((s, r) => s + total(r.values), 0)
  return UNIT_IDS.filter((u) => !entity || u === entity).flatMap((unit) => {
    const balance = new Map(trialBalance(all, { entity: unit }).rows.map((r) => [String(r.account.values.code), r.balance]))
    const row = (code: string, label: string, subledger: number) => ({ entity: unit, code, label, ledger: balance.get(code) ?? 0, subledger, difference: subledger - (balance.get(code) ?? 0) })
    return [
      row(POSTING.receivable, 'Piutang usaha', (all['fin.receivables'] ?? []).filter((r) => ['issued', 'overdue'].includes(r.status) && r.values.entity === unit).reduce((s, r) => s + baseIdr(r.values) + ppnOf(r.values) - creditedOn(all, r.id), 0)),
      row(POSTING.payable, 'Utang usaha', open('fin.payables', ['approved'], unit, docTotal)),
    ]
  })
}

/**
 * The group as one entity: each unit's totals by class, less the intercompany receivable and payable the units hold
 * against each other. Equity carries the period's earnings, so assets equal liabilities plus equity in every column.
 */
export function consolidation(all: All, scope: Omit<Scope, 'entity'> = {}, ownership: Readonly<Record<string, number>> = {}) {
  const units = UNIT_IDS.map((unit) => {
    const rows = trialBalance(all, { ...scope, entity: unit }).rows
    const total = (cls: string) => rows.filter((r) => r.account.values.class === cls).reduce((s, r) => s + r.balance, 0)
    const code = (c: string) => rows.find((r) => r.account.values.code === c)?.balance ?? 0
    const [revenue, expense] = [total('Revenue'), total('Expense')]
    return { unit, assets: total('Asset'), liabilities: total('Liability'), equity: total('Equity') + revenue - expense, revenue, expense, net: revenue - expense, due: code('1220'), owed: code('2120') }
  })
  const sum = (f: (u: (typeof units)[number]) => number) => units.reduce((s, u) => s + f(u), 0)
  // Only balances both sides hold are eliminated; an unmatched remainder stays visible as a difference to investigate.
  const eliminated = Math.min(sum((u) => u.due), sum((u) => u.owed))
  // Sales between units are matched in the intercompany register; the group drops them from both revenue and cost.
  const icSales = (all['epm.intercompany'] ?? []).filter((e) => ['matched', 'eliminated'].includes(e.status) && (!scope.from || String(e.values.date) >= scope.from) && (!scope.to || String(e.values.date) <= scope.to)).reduce((s, e) => s + num(e.values.amount), 0)
  // Minority shareholders own the rest of a partly owned unit's equity and profit.
  const minority = { equity: Math.round(sum((u) => u.equity * (1 - (ownership[u.unit] ?? 1)))), net: Math.round(sum((u) => u.net * (1 - (ownership[u.unit] ?? 1)))) }
  const group = { assets: sum((u) => u.assets) - eliminated, liabilities: sum((u) => u.liabilities) - eliminated, equity: sum((u) => u.equity), revenue: sum((u) => u.revenue) - icSales, expense: sum((u) => u.expense) - icSales, net: sum((u) => u.net) }
  return { units, eliminated, icSales, minority, unmatched: sum((u) => u.due) - sum((u) => u.owed), group }
}

/** Posted expense per cost centre: debits less credits on expense accounts for lines that name a centre. */
export function costCentreSpend(all: All, scope: Scope = {}) {
  const expense = new Set(accountsOf(all).filter((a) => a.values.class === 'Expense').map((a) => a.id))
  const by = new Map<string, number>()
  for (const l of ledgerLines(all, scope)) {
    const centre = String(l.line.values.costcenter ?? '')
    if (centre && expense.has(l.account)) by.set(centre, (by.get(centre) ?? 0) + l.debit - l.credit)
  }
  return [...by].map(([centre, amount]) => ({ centre, amount })).sort((a, b) => b.amount - a.amount)
}
