import { beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ROLE } from '@/domain/erp'
import { bankOnlyPosting, bankReconciliation, ebupotXml, efakturRows, fxRevaluation, latestPayrollPeriod, matchSuggestions, payrollTransfer, recurringDue, runTransfer } from '@/domain/bank'
import { bomNeeds, effectsFor, licenceProblem, runInvoices, threeWayMatch } from '@/domain/effects'
import { assetBook, consolidation, costCentreSpend, incomeStatement, journalBalance, subledgerTie, trialBalance } from '@/domain/ledger'
import { calibration, feedbackAssignments, feedbackSummary } from '@/domain/performance'
import { capacityLoad, energyCostOf, finishedLots, finishedRevaluation, lotCleared, mrpRun, overheadCostOf, traceLot } from '@/domain/plant'
import { lowStock } from '@/domain/automation'
import { cashForecast } from '@/domain/bank'
import { annualPph21, bpjsOf, employerBpjsOf, overtimePay, payslipFor, pph21, ptkpOf, severanceOf, terCategory, thrOf } from '@/domain/payroll'
import type { ErpRecord, Values } from '@/domain/records'
import { employeeOf, isRestDay } from '@/domain/selfService'
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
    // 50 units at Rp 10 million each join the stock row and pull its average cost toward the purchase price.
    const row = seed['inv.stock']!.find((r) => r.id === fx.patches[0]!.id)!
    const had = Number(row.values.onHand)
    expect(fx.patches[0]!.values).toEqual({ onHand: had + 50, avgCost: Math.round((had * Number(row.values.avgCost) + 50 * 10_000_000) / (had + 50)) })
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
    expect(run.patches.find((p) => p.id === order.id)).toEqual(expect.objectContaining({ values: { materialCost: cost } }))
    const std = Number(seed['bpf.formulas']!.find((f) => f.id === 'FRM-0002')!.values.costPerT)
    // One tonne planned, 0.9 produced: conversion cost joins WIP, stock takes 0.9 t at standard, the rest is variance.
    const done = effectsFor('bpf.orders', { ...order, values: { ...order.values, materialCost: cost, output: 0.9 } }, 'completed', seed, today)
    const [conversion, receipt] = done.postings
    expect(Object.fromEntries(conversion!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))).toEqual({ '1320': 580_000, '2320': -180_000, '2310': -400_000 })
    const lines = Object.fromEntries(receipt!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
    expect(lines['1330']).toBe(Math.round(0.9 * std))
    expect(lines['5410']).toBe(Math.round(0.1 * std))
    expect(lines['1320']).toBe(-(cost + 580_000))
    expect(balanced(receipt!.lines)).toBe(true)
    expect(done.patches.find((p) => p.id === order.id)!.values).toEqual(expect.objectContaining({ output: 0.9, conversionCost: 580_000, energyCost: 140_000, yieldVariance: Math.round(0.1 * std) }))
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
    const run = rec('hrs.payroll', 'PAY-T', 'draft', { period: '2027-02', entity: 'fertiliser', headcount: 1, gross: 1, deductions: 0 })
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

describe('payroll rules', () => {
  const employee = (values: Values) => rec('mdm.employees', 'EMP-T', 'active', { entity: 'holding', baseSalary: 10_000_000, allowance: 1_500_000, ptkp: 'K/1', joined: '2020-01-01', ...values })

  it('caps pension and health contributions and adds the employer share', () => {
    expect(bpjsOf(8_000_000)).toBe(320_000)
    expect(bpjsOf(20_000_000)).toBe(400_000 + 104_140 + 120_000)
    expect(employerBpjsOf(8_000_000)).toBe(Math.round(8_000_000 * 0.1024))
  })

  it('pays overtime at 1.5 times the first hour and twice after', () => {
    expect(overtimePay(1, 1_730_000)).toBe(15_000)
    expect(overtimePay(3, 1_730_000)).toBe(55_000)
    // Rest day: eight hours at twice, the ninth at three times, the tenth at four.
    expect(overtimePay(8, 1_730_000, true)).toBe(160_000)
    expect(overtimePay(10, 1_730_000, true)).toBe(230_000)
  })

  it('settles December under Article 17 against the tax withheld in the year', () => {
    expect(ptkpOf('TK/0')).toBe(54_000_000)
    expect(ptkpOf('K/3')).toBe(72_000_000)
    expect(annualPph21(120_000_000, 'TK/0')).toBe(3_000_000)
    const prior = Array.from({ length: 11 }, (_, i) => rec('hrs.payslips', `PSL-T${i}`, 'paid', { employee: 'EMP-T', period: `2026-${String(i + 1).padStart(2, '0')}`, base: 10_000_000, allowance: 1_500_000, overtime: 0, pph21: 100_000 }))
    const december = payslipFor(employee({}), '2026-12', { 'hrs.payslips': prior })
    expect(december.pph21).toBe(annualPph21(138_000_000, 'K/1') - 1_100_000)
    expect(payslipFor(employee({}), '2026-11', { 'hrs.payslips': prior }).pph21).toBe(pph21(11_500_000, 'K/1'))
  })

  it('adds shift, meal and hazard allowances and pays rest-day overtime at the higher rate', () => {
    const shifts = [rec('hrs.shifts', 'SHF-N', 'active', { name: 'Night' }), rec('hrs.shifts', 'SHF-M', 'active', { name: 'Morning' })]
    const day = (date: string, shift: string) => rec('hrs.attendance', `ATT-${date}`, 'verified', { employee: 'EMP-T', date, shift, result: 'On time' })
    const ot = (id: string, date: string) => rec('hrs.overtime', id, 'approved', { employee: 'EMP-T', date, hours: 2 })
    const me = employee({ crew: 'A' })
    const november = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    const [off, work] = [november.find((d) => isRestDay(me, d, []))!, november.find((d) => !isRestDay(me, d, []))!]
    const all = { 'hrs.shifts': shifts, 'hrs.attendance': [day('2026-11-16', 'SHF-M'), day('2026-11-20', 'SHF-N'), day('2026-11-21', 'SHF-N')], 'hrs.overtime': [ot('OT-1', work), ot('OT-2', off)] }
    const slip = payslipFor(me, '2026-11', all)
    expect(slip).toEqual(expect.objectContaining({ shiftAllowance: 80_000, meal: 90_000, hazard: 750_000 }))
    expect(slip.overtime).toBe(overtimePay(2, 11_500_000) + overtimePay(2, 11_500_000, true))
    expect(payslipFor(employee({ crew: 'Office' }), '2026-11', all).hazard).toBe(0)
  })

  it('prorates THR below a year of service and computes severance by reason', () => {
    expect(thrOf(employee({}), '2026-03-01')).toBe(11_500_000)
    expect(thrOf(employee({ joined: '2025-09-01' }), '2026-03-01')).toBe(Math.round(11_500_000 * (5 / 12)))
    expect(severanceOf(10_000_000, 5.5, 'Termination')).toEqual({ severance: 60_000_000, service: 20_000_000, compensation: 0, total: 80_000_000 })
    expect(severanceOf(10_000_000, 5.5, 'Retirement').severance).toBe(105_000_000)
    expect(severanceOf(10_000_000, 5.5, 'Voluntary').total).toBe(0)
    expect(severanceOf(10_000_000, 2, 'End of contract').total).toBe(20_000_000)
  })
})

describe('people flows', () => {
  it('limits loans to one running loan and 30% of base pay', () => {
    const me = seed['mdm.employees']![0]!
    const loan = (installment: number) => rec('hrs.loans', 'LOA-T', 'draft', { employee: me.id, purpose: 'Uji', amount: installment * 10, tenor: 10, installment })
    const none = { ...seed, 'hrs.loans': [] }
    expect(effectsFor('hrs.loans', loan(Number(me.values.baseSalary)), 'created', none, today).blocker).toMatch(/30%/)
    expect(effectsFor('hrs.loans', loan(100_000), 'created', none, today).blocker).toBeUndefined()
    expect(effectsFor('hrs.loans', loan(100_000), 'created', put(none, rec('hrs.loans', 'LOA-U', 'approved', { employee: me.id })), today).blocker).toMatch(/berjalan/)
  })

  it('applies approved profile changes, raises and attendance corrections', () => {
    const change = rec('hrs.profilechanges', 'PCR-T', 'submitted', { employee: 'EMP-0001', field: 'Tax status (PTKP)', proposed: 'K/2' })
    expect(effectsFor(change.type, change, 'approved', seed, today).patches[0]).toEqual(expect.objectContaining({ id: 'EMP-0001', values: { ptkp: 'K/2' } }))
    const raise = rec('hrs.merit', 'MRT-T', 'submitted', { employee: 'EMP-0001', current: 6_000_000, proposed: 6_600_000 })
    expect(effectsFor(raise.type, raise, 'approved', seed, today).patches[0]!.values.baseSalary).toBe(6_600_000)
    const fix = rec('hrs.corrections', 'ATC-T', 'submitted', { employee: 'EMP-0001', date: '2031-01-06', checkIn: '07:01', checkOut: '15:02' })
    expect(effectsFor(fix.type, fix, 'approved', seed, today).creates[0]).toEqual(expect.objectContaining({ type: 'hrs.attendance' }))
  })

  it('turns an approved resignation into offboarding and completes it only when cleared', () => {
    const resign = rec('hrs.resignations', 'RSG-T', 'submitted', { employee: 'EMP-0002', lastDay: '2026-12-31', reason: 'Uji' })
    expect(effectsFor(resign.type, resign, 'approved', seed, today).creates[0]).toEqual(expect.objectContaining({ type: 'hrs.offboarding' }))
    const off = (cleared: boolean) => rec('hrs.offboarding', 'OFB-T', 'exit_interview', { employee: 'EMP-0002', clearanceHr: 'Cleared', clearanceIt: 'Cleared', clearanceFinance: 'Cleared', clearanceManager: cleared ? 'Cleared' : 'Pending' })
    expect(effectsFor('hrs.offboarding', off(false), 'completed', seed, today).blocker).toMatch(/Manager/)
    expect(effectsFor('hrs.offboarding', off(true), 'completed', seed, today).moves).toEqual([expect.objectContaining({ id: 'EMP-0002', status: 'inactive' })])
  })

  it('accrues an approved expense claim and pays it from the bank', () => {
    const claim = rec('hrs.expenses', 'EXP-T', 'submitted', { employee: 'EMP-0001', description: 'Uji', amount: 750_000 })
    expect(effectsFor(claim.type, claim, 'approved', seed, today).postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['6600', '2310'])
    expect(effectsFor(claim.type, claim, 'paid', seed, today).postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['2310', '1120'])
  })

  it('raises THR payslips without BPJS for a THR run', () => {
    const run = rec('hrs.payroll', 'PAY-T', 'draft', { period: '2027-03', kind: 'THR', entity: 'fertiliser' })
    const fx = effectsFor('hrs.payroll', run, 'calculated', seed, today)
    expect(fx.creates.length).toBeGreaterThan(0)
    for (const c of fx.creates) expect(c.values).toEqual(expect.objectContaining({ kind: 'THR', bpjs: 0, loan: 0 }))
  })
})

describe('ledger tools', () => {
  it('reverses a posted journal with the opposite entry and keeps both in the ledger', () => {
    const journal = seed['fin.journals']!.find((j) => j.status === 'posted')!
    const [posting] = effectsFor('fin.journals', journal, 'reversed', seed, today).postings
    const original = seed['fin.journallines']!.filter((l) => l.values.journal === journal.id)
    expect(posting!.lines.map((l) => [l.account, l.debit, l.credit])).toEqual(original.map((l) => [l.values.account, Number(l.values.credit) || 0, Number(l.values.debit) || 0]))
    const tb = trialBalance(put(seed, { ...journal, status: 'reversed' }))
    expect(tb.debit).toBe(trialBalance(seed).debit)
  })

  it('posts cash in, cash out and transfers on the right sides', () => {
    const acc = (c: string) => seed['mdm.accounts']!.find((a) => a.values.code === c)!.id
    const move = (values: Values) => rec('fin.cashmoves', 'CBM-T', 'draft', { description: 'Uji', bank: 'HB-0001', entity: 'holding', amount: 1_000_000, date: today, ...values })
    const codes = (m: ErpRecord) => effectsFor(m.type, m, 'posted', seed, today).postings[0]!.lines.map((l) => code(seed, l.account))
    expect(codes(move({ kind: 'Cash in', account: acc('4900') }))).toEqual(['1120', '4900'])
    expect(codes(move({ kind: 'Cash out', account: acc('6500') }))).toEqual(['6500', '1120'])
    expect(codes(move({ kind: 'Transfer', toBank: 'HB-0002' }))).toEqual(['1130', '1120'])
    expect(effectsFor('fin.cashmoves', move({ kind: 'Cash out' }), 'posted', seed, today).blocker).toMatch(/akun lawan/)
    expect(effectsFor('fin.cashmoves', move({ kind: 'Cash out', account: acc('6000') }), 'posted', seed, today).blocker).toMatch(/akun induk/)
  })

  it('books a credit note against revenue, VAT and the receivable, and keeps the subledger tied', () => {
    const invoice = seed['fin.receivables']!.find((r) => r.status === 'issued' && r.values.tax === 'PPN 11%' && r.values.currency !== 'USD')!
    const note = rec('fin.creditnotes', 'CN-T', 'submitted', { invoice: invoice.id, amount: 1_000_000, reason: 'Uji' })
    const [posting] = effectsFor(note.type, note, 'approved', seed, today).postings
    expect(posting!.lines.map((l) => Number(l.debit) || -Number(l.credit))).toEqual([1_000_000, 110_000, -1_110_000])
    expect(effectsFor(note.type, { ...note, values: { ...note.values, amount: 1e15 } }, 'created', seed, today).blocker).toMatch(/melebihi/)
    const journal = rec('fin.journals', 'JE-T', 'posted', { ...posting!.journal })
    const lines = posting!.lines.map((l, i) => rec('fin.journallines', `JL-T${i}`, 'recorded', { ...l, journal: journal.id }))
    const after = put(seed, { ...note, status: 'approved' }, journal, ...lines)
    expect(subledgerTie(after, String(invoice.values.entity)).find((r) => r.code === '1210')!.difference).toBe(0)
  })

  it('raises due recurring journals and moves their next run on', () => {
    const due = recurringDue(seed, today)
    expect(due.length).toBe(3)
    for (const d of due) {
      expect(balanced(d.posting.lines)).toBe(true)
      expect(d.next > String(d.template.values.nextRun)).toBe(true)
    }
  })
})

describe('group finance', () => {
  it('depreciates faster under declining balance and never below salvage', () => {
    const asset = { cost: 100_000_000, salvage: 10_000_000, life: 5, acquired: '2024-10-30' }
    const straight = assetBook({ ...asset, method: 'Straight line' }, today)
    const declining = assetBook({ ...asset, method: 'Declining balance' }, today)
    expect(straight.accumulated).toBe(36_000_000)
    expect(declining.book).toBe(36_000_000)
    expect(declining.accumulated).toBeGreaterThan(straight.accumulated)
    expect(assetBook({ ...asset, method: 'Declining balance' }, '2060-01-01').book).toBe(10_000_000)
    expect(assetBook({ ...asset, method: 'Straight line' }, '2060-01-01').yearly).toBe(0)
  })

  it('books a gain or a loss when an asset is disposed', () => {
    const asset = (proceeds: number) => rec('fin.assets', 'FA-T', 'active', { name: 'Uji', entity: 'chemicals', class: 'Vehicles', cost: 100_000_000, salvage: 0, life: 5, acquired: '2024-10-30', method: 'Straight line', proceeds })
    const lines = (proceeds: number) => Object.fromEntries(effectsFor('fin.assets', asset(proceeds), 'disposed', seed, today).postings[0]!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
    expect(lines(70_000_000)).toEqual({ '1120': 70_000_000, '1590': 40_000_000, '1530': -100_000_000, '4900': -10_000_000 })
    expect(lines(50_000_000)).toEqual({ '1120': 50_000_000, '1590': 40_000_000, '6900': 10_000_000, '1530': -100_000_000 })
  })

  it('pays every invoice of a payment run with one journal', () => {
    const invoices = seed['fin.payables']!.filter((p) => p.status === 'approved' && p.values.currency !== 'USD').slice(0, 2)
    const run = rec('fin.paymentruns', 'PRN-T', 'approved', { description: 'Uji', bank: 'HB-0001', date: today, invoices: invoices.map((i) => i.id).join(', ') })
    expect(runInvoices(seed, run).map((i) => i.id)).toEqual(invoices.map((i) => i.id))
    const fx = effectsFor(run.type, run, 'executed', seed, today)
    expect(fx.moves.map((m) => m.status)).toEqual(['paid', 'paid'])
    const paid = fx.postings.reduce((s, p) => s + Number(p.journal.amount), 0)
    expect(paid).toBe(invoices.reduce((s, i) => s + Number(i.values.total), 0))
    expect(fx.postings.map((p) => p.journal.entity).sort()).toEqual([...new Set(invoices.map((i) => String(i.values.entity)))].sort())
    expect(effectsFor(run.type, { ...run, values: { ...run.values, invoices: '' } }, 'created', seed, today).blocker).toMatch(/belum berisi/)
    expect(runTransfer(seed, run, invoices, (i) => Number(i.values.total)).at(-1)![3]).toBe(paid)
  })

  it('moves an allocation between cost centres without changing the account total', () => {
    const [from, to] = seed['mdm.costcenters']!
    const account = seed['mdm.accounts']!.find((a) => a.values.code === '6500')!
    const alloc = rec('fin.allocations', 'ALC-T', 'draft', { description: 'Uji', entity: 'holding', account: account.id, fromCenter: from!.id, toCenter: to!.id, amount: 2_000_000, date: today })
    const [posting] = effectsFor(alloc.type, alloc, 'posted', seed, today).postings
    expect(posting!.lines.map((l) => [l.costcenter, l.debit, l.credit])).toEqual([[to!.id, 2_000_000, 0], [from!.id, 0, 2_000_000]])
    const journal = rec('fin.journals', 'JE-T', 'posted', { ...posting!.journal })
    const after = put(seed, journal, ...posting!.lines.map((l, i) => rec('fin.journallines', `JL-T${i}`, 'recorded', { ...l, journal: journal.id })))
    const spend = Object.fromEntries(costCentreSpend(after).map((r) => [r.centre, r.amount]))
    expect((spend[to!.id] ?? 0) - (Object.fromEntries(costCentreSpend(seed).map((r) => [r.centre, r.amount]))[to!.id] ?? 0)).toBe(2_000_000)
    expect(effectsFor(alloc.type, { ...alloc, values: { ...alloc.values, toCenter: from!.id } }, 'posted', seed, today).blocker).toMatch(/berbeda/)
  })

  it('consolidates the units and eliminates intercompany balances', () => {
    const c = consolidation(seed)
    expect(c.eliminated).toBe(5_000_000_000)
    expect(c.unmatched).toBe(0)
    expect(c.group.assets).toBe(c.group.liabilities + c.group.equity)
    for (const u of c.units) expect(u.assets, u.unit).toBe(u.liabilities + u.equity)
    expect(c.group.net).toBe(incomeStatement(seed).net)
  })

  it('writes the payroll transfer file and the withholding slips', () => {
    const period = latestPayrollPeriod(seed)
    const rows = payrollTransfer(seed, period)
    expect(rows).toHaveLength(62)
    expect(String(rows[1]![2])).toMatch(/^(Mandiri|BNI|BRI|BCA) \d+/)
    const bupot = ebupotXml(seed, '2026')
    expect(bupot.pph21).toBe(60)
    expect(bupot.xml).toContain('<Bupot21>')
  })
})

describe('performance cycles', () => {
  it('assigns self, manager, direct-report and peer reviews without repeating open pairs', () => {
    const unit = String(seed['mdm.employees']![0]!.values.orgunit)
    const team = seed['mdm.employees']!.filter((e) => e.status === 'active' && e.values.orgunit === unit)
    const rows = feedbackAssignments({ ...seed, 'hrs.feedback360': [] }, unit)
    expect(rows.filter((r) => r.relation === 'Self')).toHaveLength(team.length)
    expect(rows.filter((r) => r.relation === 'Manager')).toHaveLength(team.length - 1)
    expect(new Set(rows.map((r) => `${String(r.employee)}>${String(r.subject)}`)).size).toBe(rows.length)
    const opened = rows.map((values, i) => rec('hrs.feedback360', `F36-T${i}`, 'pending', values))
    expect(feedbackAssignments({ ...seed, 'hrs.feedback360': opened }, unit)).toEqual([])
  })

  it('hides a 360 average below three reviewers and spreads ratings per department', () => {
    const f = (i: number, subject: string, score: number) => rec('hrs.feedback360', `F36-T${i}`, 'approved', { employee: `EMP-000${i}`, subject, score })
    const summary = feedbackSummary({ 'hrs.feedback360': [f(1, 'A', 4), f(2, 'A', 5), f(3, 'A', 3), f(4, 'B', 5)] })
    expect(summary.find((s) => s.subject === 'A')).toEqual(expect.objectContaining({ visible: true, average: 4 }))
    expect(summary.find((s) => s.subject === 'B')!.visible).toBe(false)
    const cal = calibration(seed, '2026 Q3')
    expect(cal.total.count).toBe(15)
    expect(cal.total.bands.reduce((s, n) => s + n, 0)).toBe(15)
    expect(cal.rows.reduce((s, r) => s + r.count, 0)).toBe(15)
  })
})

describe('employee hand-in', () => {
  it('lets a reviewer hand in their own 360 review but not approve it', async () => {
    const s = services()
    const all = await s.records.all()
    const me = employeeOf(ADMIN_ROLE, all['mdm.employees']!)!
    const [n] = [await s.records.createMany(ADMIN_ROLE, 'hrs.feedback360', [{ employee: me.id, subject: me.id, relation: 'Self', comment: '' }])]
    expect(n).toBe(1)
    const mine = (await s.records.list('hrs.feedback360')).findLast((f) => f.values.employee === me.id && f.status === 'pending')!
    const sent = await s.records.updateOwn(ADMIN_ROLE, mine.type, mine.id, { score: 4, comment: 'Uji' }, 'submitted')
    expect(sent).toEqual(expect.objectContaining({ status: 'submitted', values: expect.objectContaining({ score: 4 }) }))
    await expect(s.records.updateOwn(ADMIN_ROLE, mine.type, mine.id, {}, 'approved')).rejects.toThrow(/cannot move/)
  }, 30_000)
})

describe('plant controls', () => {
  it('keeps a technician with a lapsed licence off a work order and demands a K3 licence on a permit', () => {
    const tech = rec('eam.technicians', 'TEC-T', 'active', { name: 'Uji', employee: 'EMP-0001' })
    const licence = (name: string, expiry: string, status = 'valid') => rec('she.licences', `LIC-${name}`, status, { employee: 'EMP-0001', licence: name, expiry })
    const wo = rec('eam.workorders', 'WO-T', 'open', { task: 'Uji', technician: tech.id })
    const base = put({ ...seed, 'she.licences': [] }, tech)
    expect(effectsFor(wo.type, wo, 'assigned', base, today).blocker).toBeUndefined()
    expect(effectsFor(wo.type, wo, 'assigned', put(base, licence('SIO Crane', '2026-01-31')), today).blocker).toMatch(/SIO Crane.*kedaluwarsa/)
    expect(licenceProblem(put(base, licence('SIO Crane', '2027-01-31')), 'EMP-0001', today)).toBeUndefined()
    const permit = rec('she.permits', 'PTW-T', 'requested', { job: 'Uji', supervisor: 'EMP-0001' })
    expect(effectsFor(permit.type, permit, 'approved', put(base, licence('SIO Crane', '2027-01-31')), today).blocker).toMatch(/Ahli K3/)
    expect(effectsFor(permit.type, permit, 'approved', put(base, licence('Ahli K3 Umum', '2027-01-31')), today).blocker).toBeUndefined()
    expect(effectsFor(permit.type, { ...permit, values: { job: 'Uji' } }, 'approved', base, today).blocker).toBeUndefined()
  })

  it('posts stock count differences, adjustments and co-product allocations', () => {
    const count = (value: number) => rec('inv.counts', 'OPN-T', 'review', { scope: 'Uji', value })
    const sides = (r: ErpRecord, to: string) => Object.fromEntries(effectsFor(r.type, r, to, seed, today).postings[0]!.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
    expect(sides(count(-4_000_000), 'posted')).toEqual({ '1310': -4_000_000, '5430': 4_000_000 })
    expect(sides(count(1_500_000), 'posted')).toEqual({ '1310': 1_500_000, '5430': -1_500_000 })
    const stock = seed['inv.stock']![0]!
    const adj = rec('inv.adjustments', 'ADJ-T', 'submitted', { stock: stock.id, qty: -2, reason: 'Spillage', value: 900_000 })
    const fx = effectsFor(adj.type, adj, 'approved', seed, today)
    expect(fx.patches[0]!.values.onHand).toBe(Number(stock.values.onHand) - 2)
    expect(sides(adj, 'approved')).toEqual({ '1310': -900_000, '5430': 900_000 })
    expect(effectsFor(adj.type, { ...adj, values: { ...adj.values, qty: -1e9 } }, 'approved', seed, today).blocker).toMatch(/melebihi stok/)
    const co = rec('cfp.coproducts', 'JCA-T', 'draft', { product: 'Gypsum', allocated: 12_000_000 })
    expect(sides(co, 'posted')).toEqual({ '1330': 12_000_000, '1320': -12_000_000 })
  })

  it('books the subsidy the state owes on subsidised fertiliser and clears it when the claim is paid', () => {
    const so = (scheme: string) => rec('dms.orders', 'SO-T', 'confirmed', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme, qty: 5, value: 5 * 2_300_000, date: today })
    const std = Number(seed['bpf.formulas']!.find((f) => f.values.grade === 'NPK 15-15-15')!.values.costPerT)
    const subsidised = effectsFor('dms.orders', so('Subsidised'), 'shipped', seed, today).postings
    expect(subsidised).toHaveLength(2)
    expect(subsidised[1]!.lines.map((l) => code(seed, l.account))).toEqual(['1240', '4110'])
    expect(subsidised[1]!.journal.amount).toBe(Math.round(5 * std * 1.1) - 5 * 2_300_000)
    expect(effectsFor('dms.orders', so('Commercial'), 'shipped', seed, today).postings).toHaveLength(1)
    const claim = rec('dms.subsidyclaims', 'SBC-T', 'verified', { period: '2026-10', qty: 5, amount: 1_000_000 })
    expect(effectsFor(claim.type, claim, 'paid', seed, today).postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['1120', '1240'])
    expect(effectsFor(claim.type, { ...claim, values: { ...claim.values, amount: 1e15 } }, 'created', seed, today).blocker).toMatch(/melebihi piutang subsidi/)
  })
})

describe('plant floor', () => {
  const fgId = (all: All) => all['mdm.materials']!.find((m) => m.values.code === 'FG-NPK15')!.id
  const order = rec('bpf.orders', 'PRD-T', 'running', { title: 'Uji', formula: 'FRM-0002', qty: 10, output: 10, line: 'Line Z', planned: today })

  it('plans material needs for the coming batches and proposes requisitions for shortages', () => {
    const big = rec('bpf.orders', 'PRD-BIG', 'planned', { title: 'Batch besar', formula: 'FRM-0002', qty: 1e6, planned: '2026-11-05' })
    const far = rec('bpf.orders', 'PRD-FAR', 'planned', { title: 'Jauh', formula: 'FRM-0002', qty: 1e6, planned: '2027-06-01' })
    const only = { ...seed, 'bpf.orders': [big, far], 'vms.requisitions': [], 'vms.orders': [] }
    const rows = mrpRun(only, today)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.orders).toBe(1)
      expect(r.shortage).toBe(Math.max(0, Math.round((r.need - r.onHand) * 1000) / 1000))
      expect(r.requisition).toEqual(expect.objectContaining({ material: r.material, qty: Math.ceil(r.shortage), needBy: '2026-11-05' }))
    }
    // A requisition already raised covers the shortage, so the next run proposes nothing for it.
    const first = rows[0]!
    const covered = mrpRun({ ...only, 'vms.requisitions': [rec('vms.requisitions', 'PR-T', 'submitted', first.requisition!)] }, today)
    expect(covered.find((r) => r.material === first.material)!.requisition).toBeUndefined()
  })

  it('opens lots on receipt and production, holds a batch until its sample passes and its COA is issued', () => {
    const po = rec('vms.orders', 'PO-T', 'released', { vendor: 'BP-0001', material: 'MAT-0001', qty: 100, value: 1e9 })
    const grn = rec('vms.receipts', 'GRN-T', 'quarantine', { po: po.id, qty: 40 })
    const receipt = effectsFor(grn.type, grn, 'accepted', put(seed, po, grn), today)
    expect(receipt.creates.map((c) => c.type)).toEqual(['wms.lots', 'gtr.movements'])
    expect(receipt.creates[0]!.values).toEqual(expect.objectContaining({ lotNo: 'RM-GRN-T', qty: 40, receipt: 'GRN-T' }))
    const made = effectsFor(order.type, order, 'completed', seed, today)
    const lot = made.creates.find((c) => c.type === 'gtr.lots')!
    expect(lot).toEqual(expect.objectContaining({ status: 'hold', values: expect.objectContaining({ lotNo: 'FG-PRD-T', remaining: 10 }) }))
    const sample = rec('qc.samples', 'SMP-T', 'approved', { order: order.id })
    expect(effectsFor(order.type, order, 'completed', put(seed, sample), today).creates.find((c) => c.type === 'gtr.lots')!.status).toBe('released')
    const held = rec('gtr.lots', 'GLT-T', 'hold', lot.values)
    expect(effectsFor(sample.type, sample, 'approved', put(seed, held), today).moves).toEqual([expect.objectContaining({ id: 'GLT-T', status: 'released' })])
    const failed = effectsFor(sample.type, sample, 'rejected', put({ ...seed, 'mes.holds': [] }, order, { ...held, status: 'released' }), today)
    expect(failed.moves[0]!.status).toBe('hold')
    expect(failed.creates[0]!.type).toBe('mes.holds')
    const released = { ...held, status: 'released' }
    expect(lotCleared(put(seed, released, sample), released)).toBe(false)
    expect(lotCleared(put(seed, released, sample, rec('qc.coa', 'COA-T', 'issued', { sample: sample.id })), released)).toBe(true)
  })

  it('ships cleared lots first in, first out and refuses stock that quality still holds', () => {
    const lot = (id: string, status: string, remaining: number, produced: string) => rec('gtr.lots', id, status, { lotNo: id, product: 'NPK 15-15-15', produced, qty: remaining, remaining, material: fgId(seed) })
    const stock = seed['inv.stock']!.filter((s) => s.values.material === fgId(seed)).reduce((s, r) => s + Number(r.values.onHand), 0)
    const so = (qty: number) => rec('dms.orders', 'SO-T', 'confirmed', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty, value: qty * 9e6, date: today })
    const all = put({ ...seed, 'gtr.lots': [] }, lot('GLT-OLD', 'released', 3, '2026-09-01'), lot('GLT-NEW', 'released', 9, '2026-10-01'), lot('GLT-HOLD', 'hold', stock, '2026-10-10'))
    expect(finishedLots(all, fgId(seed)).held).toBe(stock)
    expect(effectsFor('dms.orders', so(5), 'shipped', all, today).blocker).toMatch(/ditahan mutu/)
    const free = put({ ...seed, 'gtr.lots': [] }, lot('GLT-OLD', 'released', 3, '2026-09-01'), lot('GLT-NEW', 'released', 9, '2026-10-01'))
    const fx = effectsFor('dms.orders', so(5), 'shipped', free, today)
    expect(fx.patches.filter((p) => p.type === 'gtr.lots').map((p) => [p.id, p.values.remaining])).toEqual([['GLT-OLD', 0], ['GLT-NEW', 7]])
    expect(fx.creates.filter((c) => c.values.kind === 'Shipment').map((c) => c.values.qty)).toEqual([3, 2])
  })

  it('traces a finished lot back to its raw-material lots and forward to its shipments', () => {
    const mv = (i: number, kind: string, lotNo: string, document: string) => rec('gtr.movements', `LMV-T${i}`, 'recorded', { lotNo, kind, document, qty: 1 })
    const all = { 'gtr.movements': [mv(1, 'Receipt', 'RM-1', 'GRN-1'), mv(2, 'Consumption', 'RM-1', 'PRD-1'), mv(3, 'Production', 'FG-1', 'PRD-1'), mv(4, 'Shipment', 'FG-1', 'SO-1'), mv(5, 'Consumption', 'RM-9', 'PRD-9')] }
    expect(traceLot(all, 'fg-1').sources.map((m) => m.values.lotNo)).toEqual(['RM-1'])
    expect(traceLot(all, 'RM-1').destinations.map((m) => m.values.document)).toEqual(['SO-1'])
    expect(traceLot(all, 'PRD-1').movements).toHaveLength(2)
  })

  it('makes the weighbridge net the receipt quantity and blocks a shipment that weighs differently', () => {
    const grn = rec('vms.receipts', 'GRN-T', 'received', { po: 'PO-0001', qty: 40 })
    const ticket = (values: Values, status = 'first') => rec('wms.weighings', 'WBT-T', status, { direction: 'Inbound', plate: 'B 1 T', gross: 40, ...values })
    expect(effectsFor('wms.weighings', ticket({ receipt: grn.id }), 'completed', put(seed, grn), today).blocker).toMatch(/tara/)
    const done = ticket({ receipt: grn.id, tare: 14.5, net: 25.5 })
    expect(effectsFor('wms.weighings', done, 'completed', put(seed, grn), today).patches).toEqual([expect.objectContaining({ id: grn.id, values: { qty: 25.5 } })])
    expect(effectsFor(grn.type, grn, 'accepted', put(seed, grn, done), today).blocker).toMatch(/belum ditimbang kedua/)
    const so = rec('dms.orders', 'SO-T', 'confirmed', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty: 5, value: 45e6, date: today })
    const out = (net: number) => rec('wms.weighings', 'WBT-O', 'completed', { direction: 'Outbound', order: so.id, gross: 20, tare: 20 - net, net })
    expect(effectsFor(so.type, so, 'shipped', put(seed, out(4.6)), today).blocker).toMatch(/Berat bersih/)
    expect(effectsFor(so.type, so, 'shipped', put(seed, out(5.01)), today).blocker).toBeUndefined()
  })

  it('charges metered energy to a batch and falls back to the standard rate without readings', () => {
    expect(energyCostOf(seed, order, today)).toBe(10 * 140_000)
    const reading = rec('mes.utilities', 'UTL-T', 'verified', { line: 'Line Z', date: today, cost: 6_000_000 })
    const other = rec('bpf.orders', 'PRD-U', 'completed', { line: 'Line Z', qty: 20, planned: today })
    expect(energyCostOf(put(seed, order, reading, other), order, today)).toBe(2_000_000)
  })

  it('rolls work orders up into a turnaround and closes it only when they are done', () => {
    const tar = rec('eam.turnarounds', 'TAR-T', 'running', { name: 'Uji', budget: 1e9, planned: 1, done: 0, actual: 0 })
    const wo = (status: string) => rec('eam.workorders', 'WO-T', status, { task: 'Uji', asset: seed['eam.assets']![0]!.id, turnaround: tar.id, labourHours: 10, partsCost: 2e6, cost: 2.7e6 })
    expect(effectsFor('eam.workorders', wo('draft'), 'created', put(seed, tar), today).patches).toEqual([expect.objectContaining({ id: tar.id, values: { planned: 2 } })])
    expect(effectsFor('eam.workorders', wo('progress'), 'completed', put(seed, tar), today).patches.find((p) => p.id === tar.id)!.values).toEqual({ done: 1, actual: 2.7e6 })
    expect(effectsFor(tar.type, tar, 'closed', put(seed, tar, wo('progress')), today).blocker).toMatch(/belum selesai/)
    expect(effectsFor(tar.type, tar, 'closed', put(seed, tar, wo('closed')), today).blocker).toBeUndefined()
  })

  it('reorders spare parts early enough for the supplier lead time', () => {
    const part = (values: Values) => rec('eam.parts', 'SP-T', 'active', { partNo: 'SP-T1', name: 'Seal', onHand: 10, minStock: 4, unitCost: 100, ...values })
    const base = { 'mdm.materials': [rec('mdm.materials', 'MAT-T', 'active', { code: 'MRO-SPARE' })], 'vms.requisitions': [] }
    expect(lowStock({ ...base, 'eam.parts': [part({})] }, today)).toEqual([])
    const [low] = lowStock({ ...base, 'eam.parts': [part({ dailyUse: 0.5, leadTime: 30 })] }, today)
    expect(low!.requisition).toEqual(expect.objectContaining({ qty: 13, needBy: '2026-11-29' }))
  })

  it('refuses a requisition that would overrun its cost centre budget', () => {
    const centre = rec('mdm.costcenters', 'KS-T', 'active', { name: 'Produksi uji', budget: 100e6 })
    const pr = (id: string, value: number, status = 'draft') => rec('vms.requisitions', id, status, { title: 'Uji', costcenter: centre.id, value, needBy: '2026-12-01' })
    const all = put(seed, centre, pr('PR-A', 70e6, 'approved'))
    expect(effectsFor('vms.requisitions', pr('PR-B', 40e6), 'submitted', all, today).blocker).toMatch(/tidak cukup/)
    expect(effectsFor('vms.requisitions', pr('PR-B', 30e6), 'submitted', all, today).blocker).toBeUndefined()
    expect(effectsFor('vms.requisitions', rec('vms.requisitions', 'PR-C', 'draft', { title: 'Uji', value: 9e12, needBy: '2026-12-01' }), 'submitted', all, today).blocker).toBeUndefined()
  })

  it('forecasts cash from due dates, payroll and tax', () => {
    const f = cashForecast(seed, today, 8)
    expect(f.weeks).toHaveLength(8)
    expect(f.weeks[0]!.opening).toBe(f.opening)
    for (let i = 1; i < 8; i++) expect(f.weeks[i]!.opening).toBe(f.weeks[i - 1]!.closing)
    for (const w of f.weeks) expect(w.closing).toBe(w.opening + w.receipts - w.payables - w.payroll - w.tax)
    expect(f.weeks.reduce((s, w) => s + w.payroll, 0)).toBeGreaterThan(0)
  })
})

describe('planning and commercial controls', () => {
  const fg = (all: All) => all['mdm.materials']!.find((m) => m.values.code === 'FG-NPK15')!
  const std = (all: All) => Number(all['bpf.formulas']!.find((f) => f.values.grade === 'NPK 15-15-15')!.values.costPerT)
  const codes = (p: { lines: readonly Values[] }) => Object.fromEntries(p.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))

  it('loads each line by week and refuses to release an order into a full week', () => {
    const centres = seed['mrp.workcenters']!.filter((w) => w.values.line === 'Line A Gresik')
    const slowest = Math.min(...centres.map((w) => Number(w.values.capacity)))
    const [week] = capacityLoad({ ...seed, 'bpf.orders': [] }, today, 1).filter((r) => r.line === 'Line A Gresik')
    expect(week).toEqual(expect.objectContaining({ capacity: Math.round(slowest * 8 * 3 * 7 * 0.85), load: 0, over: 0 }))
    const order = (qty: number) => rec('bpf.orders', 'PRD-T', 'planned', { title: 'Uji', formula: 'FRM-0002', qty, line: 'Line A Gresik', planned: today })
    const empty = { ...seed, 'bpf.orders': [], 'bpf.bom': [] }
    expect(effectsFor('bpf.orders', order(week!.capacity), 'released', empty, today).blocker).toBeUndefined()
    expect(effectsFor('bpf.orders', order(week!.capacity + 1), 'released', empty, today).blocker).toMatch(/penuh pada minggu/)
    expect(effectsFor('bpf.orders', { ...order(1e9), values: { ...order(1e9).values, line: 'Urea Palembang' } }, 'released', empty, today).blocker).toBeUndefined()
  })

  it('takes plant overhead from what the production cost centres spent, else the standard rate', () => {
    const order = rec('bpf.orders', 'PRD-T', 'running', { title: 'Uji', qty: 10, planned: today })
    expect(overheadCostOf({ ...seed, 'fin.journallines': [] }, order, today)).toBe(10 * 260_000)
    const centre = seed['mdm.costcenters']!.find((c) => /Production/.test(String(c.values.name)))!
    const journal = rec('fin.journals', 'JE-T', 'posted', { entity: 'fertiliser', date: today })
    const line = rec('fin.journallines', 'JL-T', 'recorded', { journal: journal.id, account: seed['mdm.accounts']!.find((a) => a.values.code === '6500')!.id, costcenter: centre.id, debit: 9_000_000, credit: 0 })
    const other = rec('bpf.orders', 'PRD-U', 'completed', { qty: 20, planned: today })
    expect(overheadCostOf(put({ ...seed, 'fin.journallines': [], 'bpf.orders': [] }, journal, line, order, other), order, today)).toBe(3_000_000)
  })

  it('trues finished goods up to a new standard cost once', () => {
    expect(finishedRevaluation(seed, today).patches).toEqual([])
    const row = seed['inv.stock']!.find((s) => s.values.material === fg(seed).id && Number(s.values.onHand) > 0)!
    const old = put(seed, { ...row, values: { ...row.values, avgCost: std(seed) - 100_000 } })
    const { posting, patches } = finishedRevaluation(old, today)
    expect(patches).toEqual([expect.objectContaining({ id: row.id, values: { avgCost: std(seed) } })])
    expect(codes(posting!)).toEqual({ '1330': Number(row.values.onHand) * 100_000, '5440': -Number(row.values.onHand) * 100_000 })
  })

  it('reverses stock, lot and accrual when goods go back to the vendor', () => {
    const po = rec('vms.orders', 'PO-T', 'closed', { vendor: 'BP-0001', material: 'MAT-0001', qty: 100, value: 1e9 })
    const grn = rec('vms.receipts', 'GRN-T', 'accepted', { po: po.id, qty: 40 })
    const lot = rec('wms.lots', 'SL-T', 'stored', { lotNo: 'RM-GRN-T', material: 'MAT-0001', qty: 40, receipt: grn.id })
    const ret = (qty: number) => rec('vms.returns', 'RTV-T', 'requested', { receipt: grn.id, qty, reason: 'Off-spec' })
    const all = put(seed, po, grn, lot)
    const fx = effectsFor('vms.returns', ret(5), 'shipped', all, today)
    expect(fx.patches.find((p) => p.id === lot.id)!.values).toEqual({ qty: 35 })
    expect(fx.patches.some((p) => p.type === 'inv.stock')).toBe(true)
    expect(fx.creates[0]!.values).toEqual(expect.objectContaining({ kind: 'Return to vendor', lotNo: 'RM-GRN-T', qty: 5 }))
    expect(codes(fx.postings[0]!)).toEqual({ '2130': 50_000_000, '1310': -50_000_000 })
    expect(effectsFor('vms.returns', ret(41), 'shipped', all, today).blocker).toMatch(/melebihi sisa/)
  })

  it('restocks a customer return at cost and raises its credit note against the open invoice', () => {
    const so = rec('dms.orders', 'SO-T', 'delivered', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty: 10, value: 90e6, date: today })
    const ret = (values: Values, status = 'requested') => rec('dms.returns', 'SRT-T', status, { order: so.id, qty: 2, reason: 'Off-spec', disposition: 'Restock', ...values })
    const all = put(seed, so)
    expect(effectsFor('dms.returns', ret({ qty: 11 }), 'created', all, today).blocker).toMatch(/melebihi/)
    const back = effectsFor('dms.returns', ret({}), 'received', all, today)
    expect(codes(back.postings[0]!)).toEqual({ '1330': 2 * std(seed), '5100': -2 * std(seed) })
    expect(back.patches[0]!.type).toBe('inv.stock')
    expect(effectsFor('dms.returns', ret({ disposition: 'Scrap' }), 'received', all, today).postings).toEqual([])
    expect(effectsFor('dms.returns', ret({}, 'received'), 'credited', all, today).blocker).toMatch(/faktur terbuka/)
    const invoice = rec('fin.receivables', 'ARI-T', 'issued', { invoiceNo: 'T', salesOrder: so.id, entity: 'fertiliser', amount: 90e6 })
    expect(effectsFor('dms.returns', ret({}, 'received'), 'credited', put(all, invoice), today).creates).toEqual([{ type: 'fin.creditnotes', status: 'submitted', values: expect.objectContaining({ invoice: invoice.id, amount: 18e6 }) }])
  })

  it('keeps consigned goods on the books until the distributor reports them sold', () => {
    const so = (values: Values) => rec('dms.orders', 'SO-T', 'confirmed', { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Subsidised', qty: 10, value: 22.5e6, date: today, terms: 'Consignment', sold: 0, ...values })
    const shipped = effectsFor('dms.orders', so({}), 'shipped', seed, today)
    expect(shipped.postings).toHaveLength(1)
    expect(codes(shipped.postings[0]!)).toEqual({ '1335': 10 * std(seed), '1330': -10 * std(seed) })
    const report = (qty: number) => rec('dms.sellthrough', 'CSL-T', 'draft', { order: 'SO-T', qty, date: today })
    const all = put(seed, { ...so({ sold: 6 }), status: 'shipped' })
    expect(effectsFor('dms.sellthrough', report(5), 'created', all, today).blocker).toMatch(/melebihi sisa konsinyasi/)
    const sold = effectsFor('dms.sellthrough', report(4), 'reported', all, today)
    expect(codes(sold.postings[0]!)).toEqual({ '5100': 4 * std(seed), '1335': -4 * std(seed) })
    expect(sold.patches[0]!.values).toEqual({ sold: 10 })
    expect(effectsFor('dms.sellthrough', report(1), 'created', put(seed, { ...so({ terms: 'Sale' }), status: 'shipped' }), today).blocker).toMatch(/konsinyasi/)
  })

  it('prices a call-off from its contract and holds it to the vendor, material, quantity and validity', () => {
    const contract = (values: Values, status = 'approved') => rec('vms.contracts', 'CTR-T', status, { title: 'Uji', vendor: 'BP-0001', material: 'MAT-0001', price: 9_000_000, quota: 100, validTo: '2027-12-31', ...values })
    const po = (values: Values) => rec('vms.orders', 'PO-T', 'draft', { title: 'Uji', contract: 'CTR-T', vendor: 'BP-0001', material: 'MAT-0001', qty: 30, value: 1, ...values })
    const all = put(seed, contract({}))
    expect(effectsFor('vms.orders', po({}), 'created', all, today).patches).toEqual([expect.objectContaining({ id: 'PO-T', values: { value: 270_000_000 } })])
    expect(effectsFor('vms.orders', po({ vendor: 'BP-0002' }), 'created', all, today).blocker).toMatch(/berbeda/)
    expect(effectsFor('vms.orders', po({}), 'created', put(all, rec('vms.orders', 'PO-U', 'released', { contract: 'CTR-T', qty: 80 })), today).blocker).toMatch(/Kuota/)
    expect(effectsFor('vms.orders', po({}), 'created', put(seed, contract({ validTo: '2026-01-01' })), today).blocker).toMatch(/masa berlaku/)
    expect(effectsFor('vms.orders', po({}), 'created', put(seed, contract({}, 'submitted')), today).blocker).toMatch(/belum disetujui/)
  })
})
