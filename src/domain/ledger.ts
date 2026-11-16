/**
 * The general ledger: double-entry rules, balances and the financial statements, all read from posted journal lines.
 * Pure functions over the record store, so the same numbers drive the reports, the cockpit and the tests.
 */
import type { ErpRecord, Values } from './records'

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
} as const

const num = (v: unknown) => Number(v) || 0
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
  const journals = new Map((all['fin.journals'] ?? []).filter((j) => j.status === 'posted' && (!scope.entity || j.values.entity === scope.entity)).map((j) => [j.id, j]))
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

/** A two-line journal: one debit, one credit, same amount. */
function entry(all: All, journal: Values, debitCode: string, creditCode: string, amount: number, memo: string): Posting | undefined {
  const id = (code: string) => accountsOf(all).find((a) => a.values.code === code)?.id
  const [debit, credit] = [id(debitCode), id(creditCode)]
  if (!debit || !credit || amount <= 0) return undefined
  return { journal: { ...journal, amount }, lines: [{ account: debit, debit: amount, credit: 0, memo }, { account: credit, debit: 0, credit: amount, memo }] }
}

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
  if (step === 'fin.receivables:created') return entry(all, head('Receivable', `Faktur pelanggan ${String(v.invoiceNo)}`), POSTING.receivable, POSTING.sales[String(v.entity)] ?? POSTING.sales.holding!, num(v.amount), String(v.invoiceNo))
  if (step === 'fin.receivables:paid') return entry(all, head('Receipt', `Pelunasan ${String(v.invoiceNo)}`), POSTING.bank, POSTING.receivable, num(v.amount), String(v.invoiceNo))
  if (step === 'fin.payables:approved') return entry(all, head('Payable', `Tagihan pemasok ${String(v.invoiceNo)}`), POSTING.inventory, POSTING.payable, num(v.amount), String(v.invoiceNo))
  if (step === 'fin.payments:approved') {
    const invoice = (all['fin.payables'] ?? []).find((p) => p.id === v.invoice)
    return entry(all, head('Payment', `Pembayaran ${String(v.reference)}`, invoice?.values.entity), POSTING.payable, bankOf(v.bank), num(v.amount), String(v.reference))
  }
  if (step === 'fin.pettycash:approved') return entry(all, head('Cash', `Kas kecil: ${String(v.purpose)}`), POSTING.expense, POSTING.pettyCash, num(v.amount), String(v.purpose))
  if (step === 'fin.advances:paid') return entry(all, head('Cash', `Uang muka: ${String(v.purpose)}`), POSTING.advance, POSTING.bank, num(v.amount), String(v.purpose))
  if (step === 'fin.advances:settled') return entry(all, head('Cash', `Pertanggungjawaban uang muka: ${String(v.purpose)}`), POSTING.expense, POSTING.advance, num(v.amount), String(v.purpose))
  return undefined
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
    byEntity.set(String(a.values.entity), (byEntity.get(String(a.values.entity)) ?? 0) + Math.round(num(a.values.depreciation) / 12))
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
