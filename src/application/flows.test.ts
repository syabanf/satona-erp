import { beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ROLE } from '@/domain/erp'
import { bankOnlyPosting, bankReconciliation, efakturRows, fxRevaluation, matchSuggestions } from '@/domain/bank'
import { bomNeeds, effectsFor, threeWayMatch } from '@/domain/effects'
import { journalBalance, subledgerTie, trialBalance } from '@/domain/ledger'
import { pph21, terCategory } from '@/domain/payroll'
import type { ErpRecord, Values } from '@/domain/records'
import { createMockPorts } from '@/infrastructure/mock'
import { createServices } from './services'

const today = '2026-10-30'
const services = () => createServices(createMockPorts({ today: () => today }))
type All = Record<string, readonly ErpRecord[]>
const rec = (type: string, id: string, status: string, values: Values): ErpRecord => ({ id, type, status, values, createdAt: '', updatedAt: '', history: [] })
const put = (all: All, ...records: ErpRecord[]): All => records.reduce<All>((a, r) => ({ ...a, [r.type]: [...(a[r.type] ?? []).filter((x) => x.id !== r.id), r] }), all)
const code = (all: All, accountId: unknown) => String(all['mdm.accounts']!.find((a) => a.id === accountId)?.values.code)
const balanced = (lines: readonly Values[]) => journalBalance(lines.map((values) => ({ values }))).balanced

let seed: All
beforeAll(async () => {
  seed = await services().records.all()
})

describe('seeded books', () => {
  it('ties the receivable and payable control accounts to the open invoices of every unit', () => {
    const rows = subledgerTie(seed)
    expect(rows).toHaveLength(8)
    for (const r of rows) expect(r.difference, `${r.entity} ${r.label}`).toBe(0)
    expect(rows.some((r) => r.subledger > 0)).toBe(true)
  })

  it('seeds vendor invoices waiting for the match that pass it', () => {
    const waiting = seed['fin.payables']!.filter((p) => p.status === 'received' && p.values.currency !== 'USD')
    expect(waiting.length).toBeGreaterThan(0)
    for (const p of waiting) expect(threeWayMatch(seed, p).ok, p.id).toBe(true)
    const tb = trialBalance(seed)
    expect(tb.debit).toBe(tb.credit)
  })
})

describe('procure to pay', () => {
  const po = rec('vms.orders', 'PO-T', 'released', { title: 'Uji', vendor: 'BP-0001', material: 'MAT-0001', qty: 100, value: 1_000_000_000 })
  const grn = rec('vms.receipts', 'GRN-T', 'accepted', { po: po.id, qty: 50 })
  const invoice = (amount: number, vendor = 'BP-0001') => rec('fin.payables', 'API-T', 'received', { invoiceNo: 'T', vendor, po: po.id, entity: 'fertiliser', amount, tax: 'PPN 11%' })

  it('matches an invoice only up to the value of the goods accepted', () => {
    const all = put(seed, po, grn)
    expect(threeWayMatch(all, invoice(500_000_000)).ok).toBe(true)
    expect(threeWayMatch(all, invoice(600_000_000)).ok).toBe(false)
    expect(threeWayMatch(all, invoice(500_000_000, 'BP-0002')).reason).toMatch(/Pemasok/)
    expect(threeWayMatch(put(seed, po), invoice(100)).reason).toMatch(/penerimaan/)
    expect(effectsFor('fin.payables', invoice(600_000_000), 'matched', all, today).blocker).toMatch(/melebihi/)
  })

  it('refuses a receipt for an unreleased order or beyond the ordered quantity', () => {
    const more = rec('vms.receipts', 'GRN-U', 'received', { po: po.id, qty: 60 })
    expect(effectsFor('vms.receipts', more, 'created', put(seed, po, grn), today).blocker).toMatch(/melebihi/)
    expect(effectsFor('vms.receipts', more, 'created', put(seed, { ...po, status: 'draft' }), today).blocker).toMatch(/dirilis/)
  })

  it('accepting goods raises stock, accrues the liability and closes a fully received order', () => {
    const second = rec('vms.receipts', 'GRN-U', 'quarantine', { po: po.id, qty: 50 })
    const fx = effectsFor('vms.receipts', second, 'accepted', put(seed, po, grn, second), today)
    expect(fx.patches[0]?.type).toBe('inv.stock')
    expect(fx.moves).toEqual([expect.objectContaining({ id: po.id, status: 'closed' })])
    const [posting] = fx.postings
    expect(posting!.journal.amount).toBe(500_000_000)
    expect(posting!.lines.map((l) => code(seed, l.account))).toEqual(['1310', '2130'])
  })

  it('books a vendor invoice with input VAT and PPh 23, and pays it only once approved', () => {
    const inv = rec('fin.payables', 'API-T', 'matched', { invoiceNo: 'T', vendor: 'BP-0001', entity: 'fertiliser', amount: 100_000_000, tax: 'PPN 11%', withholding: 'PPh 23 2%' })
    const [posting] = effectsFor('fin.payables', inv, 'approved', seed, today).postings
    expect(balanced(posting!.lines)).toBe(true)
    expect(Object.fromEntries(posting!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '1310': 100_000_000, '1410': 11_000_000, '2110': -109_000_000, '2230': -2_000_000 })
    const pay = (amount: number) => rec('fin.payments', 'VPY-T', 'draft', { reference: 'T', invoice: inv.id, amount })
    expect(effectsFor('fin.payments', pay(1), 'created', put(seed, inv), today).blocker).toMatch(/disetujui/)
    const approved = put(seed, { ...inv, status: 'approved' })
    expect(effectsFor('fin.payments', pay(110_000_000), 'created', approved, today).blocker).toMatch(/melebihi/)
    expect(effectsFor('fin.payments', pay(109_000_000), 'approved', approved, today).moves).toEqual([expect.objectContaining({ id: inv.id, status: 'paid' })])
  })

  it('books an exchange loss when a dollar invoice is paid at a higher rate', () => {
    const inv = rec('fin.payables', 'API-T', 'approved', { invoiceNo: 'T', vendor: 'BP-0001', entity: 'chemicals', amount: 1000, currency: 'USD', rate: 15_000, tax: 'Tanpa PPN' })
    const all = put(seed, inv, rec('epm.fx', 'FX-T', 'active', { currency: 'USD', rate: 16_000, date: '2099-01-01' }))
    const [posting] = effectsFor('fin.payments', rec('fin.payments', 'VPY-T', 'submitted', { reference: 'T', invoice: inv.id, amount: 1000 }), 'approved', all, today).postings
    expect(Object.fromEntries(posting!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '2110': 15_000_000, '1120': -16_000_000, '6950': 1_000_000 })
  })
})

describe('order to cash', () => {
  const so = (qty: number) => rec('dms.orders', 'SO-T', 'confirmed', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty, value: qty * 9_000_000, date: today })

  it('ships only what is in stock, lowers the stock and books cost of sales', () => {
    expect(effectsFor('dms.orders', so(10_000_000), 'shipped', seed, today).blocker).toMatch(/kurang/)
    const fx = effectsFor('dms.orders', so(5), 'shipped', seed, today)
    expect(fx.blocker).toBeUndefined()
    expect(fx.patches.every((p) => p.type === 'inv.stock')).toBe(true)
    expect(fx.patches.length).toBeGreaterThan(0)
    expect(fx.postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['5100', '1330'])
  })

  it('invoices a delivered order once, with output VAT and a tax invoice', async () => {
    const s = services()
    const delivered = (await s.records.list('dms.orders')).find((o) => o.status === 'delivered')!
    const values = { invoiceNo: 'INV/T', customer: 'BP-0001', salesOrder: delivered.id, entity: 'fertiliser', amount: 200_000_000, tax: 'PPN 11%', currency: 'IDR', due: '2026-11-30' }
    const before = (await s.records.list('fin.taxinvoices')).length
    const inv = await s.records.create(ADMIN_ROLE, 'fin.receivables', values)
    const all = await s.records.all()
    const journal = all['fin.journals']!.find((j) => j.values.reference === inv.id)!
    const lines = all['fin.journallines']!.filter((l) => l.values.journal === journal.id)
    expect(Object.fromEntries(lines.map((l) => [code(all, l.values.account), Number(l.values.debit) || -Number(l.values.credit)]))).toEqual({ '1210': 222_000_000, '4100': -200_000_000, '2210': -22_000_000 })
    expect(all['fin.taxinvoices']!.length).toBe(before + 1)
    await expect(s.records.create(ADMIN_ROLE, 'fin.receivables', { ...values, invoiceNo: 'INV/T2' })).rejects.toThrow(/sudah punya faktur/)
    expect(subledgerTie(all, 'fertiliser').find((r) => r.code === '1210')!.difference).toBe(0)
  }, 30_000)
})

describe('production', () => {
  it('consumes the bill of materials into work in progress and moves it to finished goods', () => {
    const order = rec('bpf.orders', 'PRD-T', 'released', { title: 'Uji', formula: 'FRM-0002', qty: 1 })
    const needs = bomNeeds(seed, order)
    expect(needs.length).toBeGreaterThan(0)
    const run = effectsFor('bpf.orders', order, 'running', seed, today)
    const cost = needs.reduce((s, x) => s + x.cost, 0)
    expect(run.postings[0]!.journal.amount).toBe(cost)
    expect(run.postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['1320', '1310'])
    expect(run.patches.at(-1)).toEqual(expect.objectContaining({ id: order.id, values: { materialCost: cost } }))
    const done = effectsFor('bpf.orders', { ...order, values: { ...order.values, materialCost: cost } }, 'completed', seed, today)
    expect(done.postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['1330', '1320'])
    expect(done.patches[0]?.type).toBe('inv.stock')
    expect(effectsFor('bpf.orders', { ...order, values: { ...order.values, qty: 1e9 } }, 'released', seed, today).blocker).toMatch(/kurang/)
  })
})

describe('maintenance', () => {
  it('raises the preventive work order when a meter reading passes the interval', () => {
    const asset = seed['eam.assets']![0]!
    const plan = rec('eam.plans', 'MP-T', 'active', { task: 'Ganti oli uji', asset: asset.id, strategy: 'Meter based', meterInterval: 500, lastDoneAt: Number(asset.values.runHours) })
    const reading = (hours: number) => rec('eam.meters', 'MTR-T', 'logged', { asset: asset.id, reading: Number(asset.values.runHours) + hours, date: today })
    const all = put(seed, plan)
    expect(effectsFor('eam.meters', reading(100), 'created', all, today).creates.some((c) => c.values.task === 'Ganti oli uji')).toBe(false)
    const fx = effectsFor('eam.meters', reading(600), 'created', all, today)
    expect(fx.creates.some((c) => c.type === 'eam.workorders' && c.values.task === 'Ganti oli uji' && c.values.kind === 'Preventive')).toBe(true)
    expect(fx.patches[0]).toEqual(expect.objectContaining({ id: asset.id, values: { runHours: Number(asset.values.runHours) + 600 } }))
  })

  it('charges parts and labour of a finished work order to the asset and the ledger', () => {
    const asset = seed['eam.assets']![0]!
    const wo = rec('eam.workorders', 'WO-T', 'progress', { task: 'Uji', asset: asset.id, labourHours: 10, partsCost: 2_000_000, cost: 2_700_000 })
    const fx = effectsFor('eam.workorders', wo, 'completed', seed, today)
    expect(Object.fromEntries(fx.postings[0]!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '6300': 2_700_000, '1340': -2_000_000, '2310': -700_000 })
    expect(fx.patches[0]!.values.maintenanceCost).toBe((Number(asset.values.maintenanceCost) || 0) + 2_700_000)
  })
})

describe('payroll', () => {
  it('reads PPh 21 from the TER table by family status', () => {
    expect(terCategory('K/3')).toBe('C')
    expect(pph21(5_000_000, 'TK/0')).toBe(0)
    expect(pph21(10_000_000, 'TK/0')).toBe(200_000)
    expect(pph21(10_000_000, 'K/1')).toBe(150_000)
    expect(pph21(6_500_000, 'K/3')).toBe(0)
  })

  it('raises a payslip per employee and pays the run with tax, BPJS and loans split out', () => {
    const run = rec('hrs.payroll', 'PAY-T', 'draft', { period: '2026-12', entity: 'fertiliser', headcount: 1, gross: 1, deductions: 0 })
    const staff = seed['mdm.employees']!.filter((e) => e.status === 'active' && e.values.entity === 'fertiliser')
    const calc = effectsFor('hrs.payroll', run, 'calculated', seed, today)
    expect(calc.creates).toHaveLength(staff.length)
    expect(calc.patches[0]!.values.headcount).toBe(staff.length)
    const slips = calc.creates.map((c, i) => rec('hrs.payslips', `PSL-T${i}`, 'calculated', c.values))
    const paid = effectsFor('hrs.payroll', run, 'paid', put(seed, ...slips), today)
    expect(paid.moves).toHaveLength(staff.length)
    expect(balanced(paid.postings[0]!.lines)).toBe(true)
    expect(paid.postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(expect.arrayContaining(['6100', '1120', '2310', '2220']))
  })
})

describe('treasury', () => {
  it('matches statement lines to bank journals and books the bank-only lines', () => {
    const suggestions = matchSuggestions(seed, 'HB-0001')
    const found = suggestions.filter((s) => s.journal)
    expect(found.length).toBeGreaterThan(0)
    for (const s of found) expect(Number(s.line.values.amount)).not.toBe(0)
    const fee = suggestions.find((s) => String(s.line.values.description).includes('administrasi'))!
    expect(fee.journal).toBeUndefined()
    const posting = bankOnlyPosting(seed, fee.line, today)!
    expect(posting.lines.map((l) => code(seed, l.account))).toEqual(['6600', '1120'])
    const interest = suggestions.find((s) => String(s.line.values.description).includes('giro'))!
    expect(bankOnlyPosting(seed, interest.line, today)!.lines.map((l) => code(seed, l.account))).toEqual(['1120', '4900'])
    const unknown = suggestions.find((s) => String(s.line.values.description).includes('tanpa keterangan'))!
    expect(bankOnlyPosting(seed, unknown.line, today)).toBeUndefined()
    expect(bankReconciliation(seed, 'HB-0001').unmatched).toBe(suggestions.length)
  })

  it('revalues open dollar invoices in the adjustment accounts and posts nothing on a second run', () => {
    const inv = rec('fin.receivables', 'ARI-T', 'issued', { invoiceNo: 'T', customer: 'BP-0001', entity: 'chemicals', amount: 1000, currency: 'USD', rate: 15_000, tax: 'Tanpa PPN' })
    const only = put({ ...seed, 'fin.receivables': [], 'fin.payables': [] }, inv, rec('epm.fx', 'FX-T', 'active', { currency: 'USD', rate: 16_000, date: '2099-01-01' }))
    const [posting] = fxRevaluation(only, today)
    expect(Object.fromEntries(posting!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '1215': 1_000_000, '6950': -1_000_000 })
    const journal = rec('fin.journals', 'JE-T', 'posted', { ...posting!.journal })
    const lines = posting!.lines.map((l, i) => rec('fin.journallines', `JL-T${i}`, 'recorded', { ...l, journal: journal.id }))
    expect(fxRevaluation(put(only, journal, ...lines), today)).toEqual([])
    // Once the invoice is paid its adjustment is released again.
    const released = fxRevaluation(put(only, journal, ...lines, { ...inv, status: 'paid' }), today)
    expect(Object.fromEntries(released[0]!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '1215': -1_000_000, '6950': 1_000_000 })
  })

  it('exports output VAT in the e-Faktur column order', () => {
    const [header, ...rows] = efakturRows(seed)
    expect(header?.slice(0, 4)).toEqual(['FK', 'KD_JENIS_TRANSAKSI', 'FG_PENGGANTI', 'NOMOR_FAKTUR'])
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r).toHaveLength(header!.length)
  })
})
