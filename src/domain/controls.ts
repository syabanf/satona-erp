/**
 * Finance controls on top of the document rules: the monthly budget a manual journal must stay inside, asset
 * capitalisation and transfers, the period close that waits for open work, dunning fees, and the credit check repeated
 * at shipment. A rule here adds to the base rules of the same step; a blocker from any of them stops the step.
 */
import type { Effects } from './effects'
import { ASSET_ACCOUNT, assetBook, compose, ledgerLines, POSTING } from './ledger'
import type { ErpRecord, Values } from './records'
import { baseIdr, ppnOf } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>
type Rule = (record: ErpRecord, all: All, today: string) => Partial<Effects> | undefined

const n = (v: unknown) => Number(v) || 0
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
const list = (all: All, type: string) => all[type] ?? []
const find = (all: All, type: string, id: unknown) => list(all, type).find((r) => r.id === id)
const head = (record: ErpRecord, source: string, description: string, entity: unknown, today: string): Values => ({ description, entity: String(entity || 'holding'), date: today, source, reference: record.id })
const blocked = (reason: string | undefined) => (reason ? { blocker: reason } : undefined)

/**
 * Lines of a journal that would take an expense account past its budget to the end of the journal's month: the year's
 * budget lines for the account (and cost centre, where the line names one) spread evenly over twelve months.
 */
export function budgetBreaches(all: All, journal: ErpRecord) {
  const date = String(journal.values.date)
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))]
  const budgets = new Set(list(all, 'epm.budgets').filter((b) => n(b.values.year) === year && b.values.entity === journal.values.entity && b.status !== 'rejected').map((b) => b.id))
  const lines = list(all, 'fin.journallines').filter((l) => l.values.journal === journal.id && n(l.values.debit) > n(l.values.credit))
  const posted = ledgerLines(all, { entity: String(journal.values.entity), from: `${year}-01-01`, to: `${date.slice(0, 7)}-31` })
  return lines.flatMap((l) => {
    const centre = l.values.costcenter || undefined
    const budget = list(all, 'epm.budgetlines').filter((b) => budgets.has(String(b.values.budget)) && b.values.account === l.values.account && (!centre || !b.values.costcenter || b.values.costcenter === centre)).reduce((s, b) => s + n(b.values.amount), 0)
    if (!budget) return []
    const allowed = Math.round((budget * month) / 12)
    const spent = posted.filter((p) => p.account === l.values.account && (!centre || p.line.values.costcenter === centre)).reduce((s, p) => s + p.debit - p.credit, 0)
    const amount = n(l.values.debit) - n(l.values.credit)
    const account = find(all, 'mdm.accounts', l.values.account)
    return spent + amount > allowed ? [`${String(account?.values.code)} ${String(account?.values.name)}: anggaran sampai ${date.slice(0, 7)} ${rp(allowed)}, terpakai ${rp(spent)}, jurnal ini ${rp(amount)}`] : []
  })
}

/** Work that keeps a period from closing: open close tasks, journals not yet posted, bank lines not matched. */
function periodBlockers(all: All, period: ErpRecord) {
  const month = String(period.values.period)
  const entity = find(all, 'mdm.companies', period.values.company)?.values.entity
  const tasks = list(all, 'fin.closing').filter((t) => t.values.period === period.id && t.status !== 'done')
  const journals = list(all, 'fin.journals').filter((j) => ['draft', 'submitted'].includes(j.status) && String(j.values.date).startsWith(month) && (!entity || j.values.entity === entity))
  const lines = list(all, 'fin.statementlines').filter((l) => l.status === 'unmatched' && String(l.values.date).startsWith(month))
  return [
    tasks.length ? `${tasks.length} tugas tutup buku belum selesai` : '',
    journals.length ? `${journals.length} jurnal belum diposting (${journals.slice(0, 3).map((j) => j.id).join(', ')})` : '',
    lines.length ? `${lines.length} baris rekening koran belum dicocokkan` : '',
  ].filter(Boolean)
}

/** Share of each unit the group owns; the rest belongs to minority shareholders. */
export const OWNERSHIP: Record<string, number> = { holding: 1, logistics: 1, fertiliser: 0.85, chemicals: 0.7 }

/** Tax depreciation groups (PMK 72/2023): useful life and declining-balance rate per asset class; buildings go straight line. */
const FISCAL: Record<string, { group: string; years: number; rate?: number }> = {
  'IT equipment': { group: 'Kelompok 1', years: 4, rate: 0.5 },
  Vehicles: { group: 'Kelompok 2', years: 8, rate: 0.25 },
  'Plant & machinery': { group: 'Kelompok 3', years: 16, rate: 0.125 },
  'Storage tanks': { group: 'Kelompok 4', years: 20, rate: 0.1 },
  Buildings: { group: 'Bangunan permanen', years: 20 },
}

/** Where an asset stands for tax: accumulated tax depreciation and tax book value on a date. */
export function fiscalBook(v: Values, today: string) {
  const rule = FISCAL[String(v.class)]
  const cost = n(v.cost)
  if (!rule) return { group: 'Tidak disusutkan', accumulated: 0, book: cost }
  const years = assetBook({ ...v, life: rule.years, salvage: 0, method: 'Straight line' }, today).ageYears
  const book = rule.rate ? cost * (1 - rule.rate) ** years : Math.max(0, cost - (cost * years) / rule.years)
  // Declining balance writes off what is left in the last year of the group's life.
  const ended = years >= rule.years
  return { group: rule.group, accumulated: Math.round(ended ? cost : cost - book), book: Math.round(ended ? 0 : book) }
}

export const CONTROL_RULES: Record<string, Rule> = {
  'fin.journals:submitted': (journal, all) => {
    if (journal.values.source !== 'Manual') return undefined
    const over = budgetBreaches(all, journal)
    return over.length ? { blocker: `Melebihi anggaran: ${over.join('; ')}.` } : undefined
  },

  // Assets: capitalised from a vendor invoice, the cost moves from inventory to the asset (or construction in progress).
  'fin.assets:created': (asset, all, today) => {
    if (!asset.values.invoice) return undefined
    const invoice = find(all, 'fin.payables', asset.values.invoice)
    if (!invoice || !['approved', 'paid'].includes(invoice.status)) return { blocker: 'Kapitalisasi hanya dari tagihan pemasok yang sudah disetujui.' }
    if (list(all, 'fin.assets').some((a) => a.id !== asset.id && a.values.invoice === invoice.id)) return { blocker: `${invoice.id} sudah dikapitalisasi.` }
    const posting = compose(all, head(asset, 'Manual', `Kapitalisasi ${asset.id} ${String(asset.values.name)} dari ${invoice.id}`, asset.values.entity, today), [[ASSET_ACCOUNT[String(asset.values.class)] ?? '1510', n(asset.values.cost), 0], [POSTING.inventory, 0, n(asset.values.cost)]], asset.id)
    return { postings: posting ? [posting] : [] }
  },
  'fin.assettransfers:approved': (trf, all, today) => {
    const asset = find(all, 'fin.assets', trf.values.asset)
    if (!asset) return undefined
    const [from, to] = [String(asset.values.entity), String(trf.values.toEntity)]
    if (from === to) return { blocker: 'Unit tujuan sama dengan unit pemilik sekarang.' }
    const { accumulated, book } = assetBook(asset.values, today)
    const [account, cost] = [ASSET_ACCOUNT[String(asset.values.class)] ?? '1510', n(asset.values.cost)]
    const memo = `Transfer ${asset.id} ${String(asset.values.name)}`
    // The sender gives up the asset for an intercompany receivable at book value; the receiver takes cost and history.
    const postings = [
      compose(all, head(trf, 'Manual', `${memo} ke ${to}`, from, today), [[POSTING.accumulated, accumulated, 0], [POSTING.intercompanyReceivable, book, 0], [account, 0, cost]], trf.id),
      compose(all, head(trf, 'Manual', `${memo} dari ${from}`, to, today), [[account, cost, 0], [POSTING.accumulated, 0, accumulated], [POSTING.intercompanyPayable, 0, book]], trf.id),
    ].flatMap((p) => p ?? [])
    return { patches: [{ type: asset.type, id: asset.id, values: { entity: to }, action: `Dipindah ke ${to} lewat ${trf.id}` }], postings }
  },

  // Period close waits for the month's open work.
  'epm.periods:closed': (period, all) => {
    const left = periodBlockers(all, period)
    return left.length ? { blocker: `Periode ${String(period.values.period)} belum bisa ditutup: ${left.join('; ')}.` } : undefined
  },

  // Dunning: a late fee on the letter becomes a receivable and other income of the invoice's unit.
  'fin.dunning:sent': (letter, all, today) => {
    const invoice = find(all, 'fin.receivables', letter.values.invoice)
    const fee = n(letter.values.fee)
    if (!invoice || !fee) return undefined
    const posting = compose(all, head(letter, 'Receivable', `Denda keterlambatan ${String(invoice.values.invoiceNo)}`, invoice.values.entity, today), [[POSTING.feeReceivable, fee, 0], [POSTING.sales.holding!, 0, fee]], letter.id)
    return { postings: posting ? [posting] : [] }
  },

  // Credit: the limit is checked again when goods leave, against what the distributor owes by then.
  'dms.orders:shipped': (so, all) => blocked(creditProblem(all, so, (n(so.values.qty) - n(so.values.shippedQty)) * unitPrice(so))),
  'dms.deliveries:shipped': (dlv, all) => {
    const so = find(all, 'dms.orders', dlv.values.order)
    return so ? blocked(creditProblem(all, so, n(dlv.values.qty) * unitPrice(so))) : undefined
  },
}

const unitPrice = (so: ErpRecord) => n(so.values.value) / Math.max(1, n(so.values.qty))

/** Why a distributor may not receive goods worth `value` more: open invoices plus this shipment pass the credit limit. */
function creditProblem(all: All, so: ErpRecord, value: number) {
  const d = find(all, 'dms.distributors', so.values.distributor)
  const limit = n(d?.values.creditLimit)
  if (!d || !limit || so.values.terms === 'Consignment') return undefined
  const open = list(all, 'fin.receivables').filter((r) => ['issued', 'overdue'].includes(r.status) && list(all, 'dms.orders').some((o) => o.id === r.values.salesOrder && o.values.distributor === d.id)).reduce((s, r) => s + baseIdr(r.values) + ppnOf(r.values), 0)
  const owed = Math.max(open, n(d.values.outstanding))
  return owed + value > limit ? `Limit kredit ${String(d.values.name)} terlampaui saat kirim: piutang ${rp(owed)} ditambah kiriman ini ${rp(value)} melebihi ${rp(limit)}.` : undefined
}
