import { beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ROLE } from '@/domain/erp'
import { bankOnlyPosting, bankReconciliation, ebupotXml, efakturRows, fxRevaluation, latestPayrollPeriod, matchSuggestions, payrollTransfer, recurringDue, runTransfer } from '@/domain/bank'
import { bomNeeds, effectsFor, licenceProblem, nextTaxSerial, runInvoices, threeWayMatch } from '@/domain/effects'
import { assetBook, consolidation, costCentreSpend, incomeStatement, journalBalance, subledgerTie, trialBalance } from '@/domain/ledger'
import { calibration, feedbackAssignments, feedbackSummary } from '@/domain/performance'
import { capacityLoad, energyCostOf, finishedLots, finishedRevaluation, lotCleared, mrpRun, overheadCostOf, sampleFailures, traceLot } from '@/domain/plant'
import { expiredLots, lowStock, missingAttendance } from '@/domain/automation'
import { budgetBreaches, fiscalBook, OWNERSHIP } from '@/domain/controls'
import { annualLeave, chargedDays, expiringContracts, kpiFor, periodRange, pkwtCompensation } from '@/domain/hr'
import { fromTonnes, toTonnes } from '@/domain/units'
import { cashForecast } from '@/domain/bank'
import { annualPph21, bpjsOf, employerBpjsOf, overtimePay, payslipFor, pph21, ptkpOf, severanceOf, severanceTax, slipGross, slipNet, terCategory, thrOf } from '@/domain/payroll'
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
    expect(fx.patches.some((p) => p.type === 'inv.stock')).toBe(true)
    expect(fx.patches.find((p) => p.id === 'SO-T')!.values).toEqual({ shippedQty: 5 })
    expect(fx.postings[0]!.lines.map((l) => code(seed, l.account))).toEqual(['5100', '1330'])
  })

  it('invoices a delivered order up to its value, with output VAT and a tax invoice', async () => {
    const s = services()
    const delivered = (await s.records.list('dms.orders')).find((o) => o.status === 'delivered' && Number(o.values.value) > 200_000_000)!
    const values = { invoiceNo: 'INV/T', customer: 'BP-0001', salesOrder: delivered.id, entity: 'fertiliser', amount: 200_000_000, tax: 'PPN 11%', currency: 'IDR', due: '2026-11-30' }
    const before = (await s.records.list('fin.taxinvoices')).length
    const inv = await s.records.create(ADMIN_ROLE, 'fin.receivables', values)
    const all = await s.records.all()
    const journal = all['fin.journals']!.find((j) => j.values.reference === inv.id)!
    const lines = all['fin.journallines']!.filter((l) => l.values.journal === journal.id)
    expect(Object.fromEntries(lines.map((l) => [code(all, l.values.account), Number(l.values.debit) || -Number(l.values.credit)]))).toEqual({ '1210': 222_000_000, '4100': -200_000_000, '2210': -22_000_000 })
    expect(all['fin.taxinvoices']!.length).toBe(before + 1)
    // A second invoice may bill the rest of the order, but not more than the order is worth.
    await expect(s.records.create(ADMIN_ROLE, 'fin.receivables', { ...values, invoiceNo: 'INV/T2', amount: Number(delivered.values.value) })).rejects.toThrow(/melebihi nilai yang sudah dikirim/)
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
    const { postings, patches } = finishedRevaluation(old, today)
    expect(patches).toEqual([expect.objectContaining({ id: row.id, values: { avgCost: std(seed) } })])
    expect(postings).toHaveLength(1)
    expect(codes(postings[0]!)).toEqual({ '1330': Number(row.values.onHand) * 100_000, '5440': -Number(row.values.onHand) * 100_000 })
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

describe('corrections and partial steps', () => {
  const codes = (p: { lines: readonly Values[] }) => Object.fromEntries(p.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
  const so = (values: Values, status = 'confirmed') => rec('dms.orders', 'SO-T', status, { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty: 10, value: 90e6, date: today, shippedQty: 0, ...values })
  const stdOf = (all: All) => Number(all['bpf.formulas']!.find((f) => f.values.grade === 'NPK 15-15-15')!.values.costPerT)

  it('ships an order in parts and marks it shipped with the last one', () => {
    const dlv = (qty: number) => rec('dms.deliveries', 'DLV-T', 'draft', { order: 'SO-T', qty, date: today })
    const all = put(seed, so({ shippedQty: 4 }))
    expect(effectsFor('dms.deliveries', dlv(7), 'created', all, today).blocker).toMatch(/melebihi sisa/)
    const part = effectsFor('dms.deliveries', dlv(3), 'shipped', all, today)
    expect(part.patches.find((p) => p.id === 'SO-T')!.values).toEqual({ shippedQty: 7 })
    expect(part.moves).toEqual([])
    expect(part.postings[0]!.journal).toEqual(expect.objectContaining({ reference: 'DLV-T', amount: 3 * stdOf(seed) }))
    expect(effectsFor('dms.deliveries', dlv(6), 'shipped', all, today).moves).toEqual([expect.objectContaining({ id: 'SO-T', status: 'shipped' })])
    // The order's own ship step sends only what is left.
    expect(effectsFor('dms.orders', so({ shippedQty: 4 }), 'shipped', seed, today).postings[0]!.journal.amount).toBe(6 * stdOf(seed))
  })

  it('bills a partly shipped order only for what has shipped', () => {
    const invoice = (amount: number) => rec('fin.receivables', 'ARI-T', 'issued', { invoiceNo: 'T', salesOrder: 'SO-T', entity: 'fertiliser', amount })
    expect(effectsFor('fin.receivables', invoice(1), 'created', put(seed, so({})), today).blocker).toMatch(/belum ada yang dikirim/)
    const half = put(seed, so({ shippedQty: 5 }))
    expect(effectsFor('fin.receivables', invoice(45e6), 'created', half, today).blocker).toBeUndefined()
    expect(effectsFor('fin.receivables', invoice(46e6), 'created', half, today).blocker).toMatch(/melebihi nilai yang sudah dikirim/)
    expect(effectsFor('fin.receivables', invoice(20e6), 'created', put(half, rec('fin.receivables', 'ARI-U', 'issued', { salesOrder: 'SO-T', amount: 30e6 })), today).blocker).toMatch(/sudah ditagih/)
  })

  it('cancels a shipment: stock and lots come back and the journals are reversed once', () => {
    const shipped = so({ shippedQty: 10 }, 'shipped')
    const journal = rec('fin.journals', 'JE-T', 'posted', { description: 'Harga pokok SO-T', entity: 'fertiliser', source: 'Cost of sales', reference: 'SO-T', amount: 100 })
    const lines = [['5100', 100, 0], ['1330', 0, 100]].map(([c, d, k], i) => rec('fin.journallines', `JL-T${i}`, 'recorded', { journal: journal.id, account: seed['mdm.accounts']!.find((a) => a.values.code === c)!.id, debit: d, credit: k }))
    const fgId = seed['mdm.materials']!.find((m) => m.values.code === 'FG-NPK15')!.id
    const lot = rec('gtr.lots', 'GLT-T', 'released', { lotNo: 'FG-T', material: fgId, remaining: 2 })
    const move = rec('gtr.movements', 'LMV-T', 'recorded', { lotNo: 'FG-T', kind: 'Shipment', material: fgId, qty: 8, document: 'SO-T' })
    const all = put(seed, shipped, journal, ...lines, lot, move)
    const fx = effectsFor('dms.orders', shipped, 'confirmed', all, today)
    expect(codes(fx.postings[0]!)).toEqual({ '5100': -100, '1330': 100 })
    expect(fx.patches.find((p) => p.id === lot.id)!.values).toEqual({ remaining: 10 })
    expect(fx.patches.some((p) => p.type === 'inv.stock')).toBe(true)
    expect(fx.patches.find((p) => p.id === 'SO-T')!.values).toEqual({ shippedQty: 0 })
    expect(fx.creates[0]!.values).toEqual(expect.objectContaining({ kind: 'Shipment', qty: -8 }))
    const reversed = rec('fin.journals', 'JE-R', 'posted', { reference: 'REV/JE-T' })
    expect(effectsFor('dms.orders', shipped, 'confirmed', put(all, reversed), today).postings).toEqual([])
    expect(effectsFor('dms.orders', shipped, 'confirmed', put(all, rec('fin.receivables', 'ARI-T', 'issued', { salesOrder: 'SO-T' })), today).blocker).toMatch(/sudah difaktur/)
    // A first confirmation still runs the credit check and nothing else.
    expect(effectsFor('dms.orders', so({}, 'draft'), 'confirmed', seed, today).postings).toEqual([])
  })

  it('reverses a goods receipt unless its lot was already used, and reopens the order', () => {
    const po = rec('vms.orders', 'PO-T', 'closed', { vendor: 'BP-0001', material: 'MAT-0001', qty: 40, value: 4e8 })
    const grn = rec('vms.receipts', 'GRN-T', 'accepted', { po: po.id, qty: 40 })
    const lot = (qty: number) => rec('wms.lots', 'SL-T', 'stored', { lotNo: 'RM-GRN-T', material: 'MAT-0001', qty, receipt: grn.id })
    const fx = effectsFor(grn.type, grn, 'quarantine', put(seed, po, grn, lot(40)), today)
    expect(fx.patches.find((p) => p.id === 'SL-T')!.values).toEqual({ qty: 0 })
    expect(fx.moves).toEqual([expect.objectContaining({ id: po.id, status: 'released' })])
    expect(effectsFor(grn.type, grn, 'quarantine', put(seed, po, grn, lot(25)), today).blocker).toMatch(/sudah dipakai 15/)
    // Sending a fresh receipt to QC is the same status and must do nothing.
    expect(effectsFor(grn.type, { ...grn, status: 'received' }, 'quarantine', put(seed, po, grn), today)).toEqual({ patches: [], moves: [], creates: [], postings: [] })
  })

  it('cancels a running batch and returns its materials to stock and to their lots', () => {
    const order = rec('bpf.orders', 'PRD-T', 'running', { title: 'Uji', formula: 'FRM-0002', qty: 1, line: 'Line A Gresik', planned: today, materialCost: 500 })
    const needs = bomNeeds(seed, order)
    const lot = rec('wms.lots', 'SL-T', 'stored', { lotNo: 'RM-T', material: needs[0]!.material, qty: 1 })
    const move = rec('gtr.movements', 'LMV-T', 'recorded', { lotNo: 'RM-T', kind: 'Consumption', material: needs[0]!.material, qty: 0.25, document: order.id })
    const fx = effectsFor(order.type, order, 'released', put(seed, order, lot, move), today)
    expect(fx.blocker).toBeUndefined()
    expect(fx.patches.filter((p) => p.type === 'inv.stock').length).toBeGreaterThan(0)
    expect(fx.patches.find((p) => p.id === lot.id)!.values).toEqual({ qty: 1.25 })
    expect(fx.patches.find((p) => p.id === order.id)!.values).toEqual({ materialCost: 0 })
  })

  it('releases a lab sample only inside its inspection plan', () => {
    const order = rec('bpf.orders', 'PRD-T', 'completed', { formula: 'FRM-T' })
    const plan = (parameter: string, min: number | undefined, max: number | undefined) => rec('qc.plans', `IP-${parameter}`, 'active', { formula: 'FRM-T', parameter, min, max })
    const sample = (values: Values) => rec('qc.samples', 'SMP-T', 'tested', { order: order.id, n: 15, p: 15, k: 15, moisture: 2, hardness: 3, ...values })
    const all = put({ ...seed, 'qc.plans': [] }, order, plan('Total N', 14.5, 16), plan('Moisture', undefined, 2.5), plan('Hardness', 2, undefined))
    expect(sampleFailures(all, sample({}))).toEqual([])
    expect(sampleFailures(all, sample({ n: 14, moisture: 3 }))).toEqual(['Total N 14 (minimum 14.5)', 'Moisture 3 (maksimum 2.5)'])
    // Hardness is in the plan, so a sample without it cannot pass, and one below the limit fails.
    expect(sampleFailures(all, sample({ hardness: undefined }))).toEqual(['Hardness belum diukur'])
    expect(sampleFailures(all, sample({ hardness: 1.5 }))).toEqual(['Hardness 1.5 (minimum 2)'])
    expect(effectsFor('qc.samples', sample({ n: 14 }), 'approved', all, today).blocker).toMatch(/di luar spesifikasi: Total N 14/)
    expect(effectsFor('qc.samples', sample({}), 'approved', all, today).blocker).toBeUndefined()
  })

  it('counts stock per item: lines from the system, value at review, stock set at posting', () => {
    const plant = String(seed['inv.stock']![0]!.values.plant)
    const rows = seed['inv.stock']!.filter((r) => r.values.plant === plant && r.status !== 'inactive')
    const count = rec('inv.counts', 'OPN-T', 'planned', { plant, scope: 'Uji', date: today })
    const started = effectsFor(count.type, count, 'counting', seed, today).creates
    expect(started).toHaveLength(rows.length)
    expect(started[0]!.values).toEqual(expect.objectContaining({ count: 'OPN-T', system: Number(rows[0]!.values.onHand), counted: Number(rows[0]!.values.onHand) }))
    const line = (id: string, stock: string, system: number, counted: number) => rec('inv.countlines', id, 'counted', { count: 'OPN-T', stock, system, counted, unitCost: 1_000_000, difference: counted - system, value: (counted - system) * 1_000_000 })
    const all = put({ ...seed, 'inv.countlines': [] }, line('OPL-1', rows[0]!.id, 100, 97), line('OPL-2', rows[1]!.id, 50, 50))
    expect(effectsFor(count.type, count, 'review', all, today).patches[0]!.values).toEqual({ items: 2, value: -3_000_000, variance: 2 })
    const posted = effectsFor(count.type, { ...count, values: { ...count.values, value: -3_000_000 } }, 'posted', all, today)
    expect(posted.patches).toEqual([expect.objectContaining({ type: 'inv.stock', id: rows[0]!.id, values: { onHand: Number(rows[0]!.values.onHand) - 3 } })])
    expect(codes(posted.postings[0]!)).toEqual({ '1310': -3_000_000, '5430': 3_000_000 })
  })

  it('holds annual leave to the balance and takes absence and unpaid leave off pay', () => {
    const annual = seed['hrs.leavetypes']!.find((t) => /annual/i.test(String(t.values.name)))!
    const unpaid = seed['hrs.leavetypes']!.find((t) => /unpaid/i.test(String(t.values.name)))!
    const me = rec('mdm.employees', 'EMP-T', 'active', { entity: 'holding', baseSalary: 8_400_000, allowance: 2_100_000, ptkp: 'TK/0', joined: '2026-09-15', crew: 'Office' })
    const leave = (id: string, days: number, status: string, type = annual.id) => rec('hrs.leaves', id, status, { employee: me.id, leaveType: type, from: '2026-11-10', days })
    const all = put({ ...seed, 'hrs.leaves': [], 'hrs.attendance': [], 'hrs.payslips': [], 'hrs.overtime': [], 'hrs.loans': [] }, me, leave('LV-A', 2, 'approved'))
    // Joined in September: four days earned this year, two taken.
    expect(effectsFor('hrs.leaves', leave('LV-B', 3, 'draft'), 'created', all, today).blocker).toMatch(/tinggal 2 hari \(hak 4/)
    expect(effectsFor('hrs.leaves', leave('LV-B', 2, 'draft'), 'created', all, today).blocker).toBeUndefined()
    expect(effectsFor('hrs.leaves', leave('LV-B', 9, 'draft', unpaid.id), 'created', all, today).blocker).toBeUndefined()
    const absent = rec('hrs.attendance', 'ATT-T', 'verified', { employee: me.id, date: '2026-11-05', result: 'Absent' })
    const slip = payslipFor(me, '2026-11', put(all, absent, leave('LV-C', 2, 'approved', unpaid.id)))
    expect(slip.absence).toBe(3 * 500_000)
    expect(slipGross(slip)).toBe(8_400_000 + 2_100_000 - 1_500_000)
  })
})

describe('finer corrections', () => {
  const codes = (p: { lines: readonly Values[] }) => Object.fromEntries(p.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
  const so = (values: Values, status = 'confirmed') => rec('dms.orders', 'SO-T', status, { distributor: 'DST-0001', product: 'NPK 15-15-15', scheme: 'Commercial', qty: 10, value: 90e6, date: today, shippedQty: 0, ...values })
  const fgId = (all: All) => all['mdm.materials']!.find((m) => m.values.code === 'FG-NPK15')!.id
  const journal = (id: string, description: string, reference: string, lines: Array<[string, number, number]>) => [
    rec('fin.journals', id, 'posted', { description, entity: 'fertiliser', source: 'Production', reference, amount: lines[0]![1] }),
    ...lines.map(([c, d, k], i) => rec('fin.journallines', `${id}-L${i}`, 'recorded', { journal: id, account: seed['mdm.accounts']!.find((a) => a.values.code === c)!.id, debit: d, credit: k })),
  ]

  it('reopens a completed batch: output leaves stock and only the conversion and receipt journals are reversed', () => {
    const order = rec('bpf.orders', 'PRD-T', 'completed', { title: 'Uji', formula: 'FRM-0002', qty: 2, output: 2, materialCost: 800, conversionCost: 100 })
    const lot = (remaining: number) => rec('gtr.lots', 'GLT-T', 'released', { lotNo: 'FG-PRD-T', material: fgId(seed), qty: 2, remaining, order: order.id })
    const books = [...journal('JE-A', 'Pemakaian bahan PRD-T', order.id, [['1320', 800, 0], ['1310', 0, 800]]), ...journal('JE-B', 'Tenaga kerja, overhead dan energi PRD-T', order.id, [['1320', 100, 0], ['2310', 0, 100]]), ...journal('JE-C', 'Hasil produksi PRD-T', order.id, [['1330', 900, 0], ['1320', 0, 900]])]
    const all = put(seed, order, lot(2), ...books)
    const fx = effectsFor(order.type, order, 'running', all, today)
    expect(fx.postings.map((p) => p.journal.reference).sort()).toEqual(['REV/JE-B', 'REV/JE-C'])
    expect(codes(fx.postings.find((p) => p.journal.reference === 'REV/JE-C')!)).toEqual({ '1330': -900, '1320': 900 })
    expect(fx.patches.find((p) => p.id === 'GLT-T')!.values).toEqual({ qty: 0, remaining: 0 })
    expect(fx.patches.find((p) => p.id === order.id)!.values).toEqual(expect.objectContaining({ output: 0, conversionCost: 0 }))
    expect(fx.patches.some((p) => p.type === 'inv.stock')).toBe(true)
    expect(fx.moves).toEqual([expect.objectContaining({ id: 'GLT-T', status: 'hold' })])
    expect(effectsFor(order.type, order, 'running', put(seed, order, lot(1.5), ...books), today).blocker).toMatch(/sudah dikirim 0.5 t/)
  })

  it('cancels one delivery and takes its tonnes off the order, unless it was invoiced', () => {
    const dlv = rec('dms.deliveries', 'DLV-T', 'shipped', { order: 'SO-T', qty: 4, date: today })
    const lot = rec('gtr.lots', 'GLT-T', 'released', { lotNo: 'FG-T', material: fgId(seed), remaining: 1 })
    const move = rec('gtr.movements', 'LMV-T', 'recorded', { lotNo: 'FG-T', kind: 'Shipment', material: fgId(seed), qty: 4, document: dlv.id })
    const all = put(seed, so({ shippedQty: 10 }, 'shipped'), dlv, lot, move, ...journal('JE-A', 'Harga pokok DLV-T', dlv.id, [['5100', 400, 0], ['1330', 0, 400]]))
    const fx = effectsFor(dlv.type, dlv, 'draft', all, today)
    expect(fx.patches.find((p) => p.id === 'SO-T')!.values).toEqual({ shippedQty: 6 })
    expect(fx.patches.find((p) => p.id === 'GLT-T')!.values).toEqual({ remaining: 5 })
    expect(fx.moves).toEqual([expect.objectContaining({ id: 'SO-T', status: 'confirmed' })])
    expect(codes(fx.postings[0]!)).toEqual({ '5100': -400, '1330': 400 })
    expect(effectsFor(dlv.type, dlv, 'draft', put(all, rec('fin.receivables', 'ARI-T', 'issued', { salesOrder: 'SO-T', delivery: dlv.id, amount: 1 })), today).blocker).toMatch(/sudah difaktur/)
    expect(effectsFor(dlv.type, dlv, 'draft', put(all, rec('fin.receivables', 'ARI-T', 'issued', { salesOrder: 'SO-T', amount: 80e6 })), today).blocker).toMatch(/lebih dari nilai yang tersisa/)
  })

  it('bills one delivery for its own tonnes, once', () => {
    const dlv = rec('dms.deliveries', 'DLV-T', 'shipped', { order: 'SO-T', qty: 4, date: today })
    const invoice = (amount: number, id = 'ARI-T') => rec('fin.receivables', id, 'issued', { invoiceNo: id, salesOrder: 'SO-T', delivery: dlv.id, entity: 'fertiliser', amount })
    const all = put(seed, so({ shippedQty: 4 }), dlv)
    expect(effectsFor('fin.receivables', invoice(36e6), 'created', all, today).blocker).toBeUndefined()
    expect(effectsFor('fin.receivables', invoice(37e6), 'created', all, today).blocker).toMatch(/melebihi nilai/)
    expect(effectsFor('fin.receivables', invoice(10e6, 'ARI-U'), 'created', put(all, invoice(20e6)), today).blocker).toMatch(/sudah punya faktur/)
    expect(effectsFor('fin.receivables', invoice(10e6), 'created', put(seed, so({ shippedQty: 4 }), { ...dlv, status: 'draft' }), today).blocker).toMatch(/sudah dikirim dari pesanan yang sama/)
  })

  it('counts a material lot by lot in its bin and moves the stock balance by the lots\' differences', () => {
    const stock = seed['inv.stock']![0]!
    const plant = String(stock.values.plant)
    const warehouse = rec('wms.warehouses', 'WH-T', 'active', { plant })
    const zone = rec('wms.zones', 'ZON-T', 'active', { warehouse: warehouse.id })
    const bin = rec('wms.bins', 'BIN-T', 'active', { bin: 'A-01-01', zone: zone.id })
    const lot = (id: string, qty: number) => rec('wms.lots', id, 'stored', { lotNo: id, bin: bin.id, material: stock.values.material, qty })
    const count = rec('inv.counts', 'OPN-T', 'planned', { plant, scope: 'Uji', date: today })
    const all = put({ ...seed, 'wms.lots': [], 'inv.stock': [stock] }, warehouse, zone, bin, lot('SL-A', 30), lot('SL-B', 12))
    const lines = effectsFor(count.type, count, 'counting', all, today).creates
    expect(lines.map((l) => [l.values.lot, l.values.bin, l.values.system])).toEqual([['SL-A', 'A-01-01', 30], ['SL-B', 'A-01-01', 12]])
    const line = (id: string, lotId: string, system: number, counted: number) => rec('inv.countlines', id, 'counted', { count: count.id, stock: stock.id, lot: lotId, system, counted, difference: counted - system })
    const posted = effectsFor(count.type, count, 'posted', put({ ...all, 'inv.countlines': [] }, line('OPL-1', 'SL-A', 30, 28), line('OPL-2', 'SL-B', 12, 13)), today)
    expect(posted.patches).toEqual([
      expect.objectContaining({ type: 'wms.lots', id: 'SL-A', values: { qty: 28 } }),
      expect.objectContaining({ type: 'wms.lots', id: 'SL-B', values: { qty: 13 } }),
      expect.objectContaining({ type: 'inv.stock', id: stock.id, values: { onHand: Number(stock.values.onHand) - 1 } }),
    ])
  })

  it('deducts late days from pay and files absences for rostered staff who never clocked in', () => {
    const me = rec('mdm.employees', 'EMP-T', 'active', { entity: 'holding', baseSalary: 8_400_000, allowance: 2_100_000, ptkp: 'TK/0', joined: '2020-01-01', crew: 'Office' })
    const day = (date: string, result: string) => rec('hrs.attendance', `ATT-${date}`, 'verified', { employee: me.id, date, result })
    const slip = payslipFor(me, '2026-11', { 'hrs.attendance': [day('2026-11-02', 'Late'), day('2026-11-03', 'Late'), day('2026-11-04', 'On time')] })
    expect(slip.late).toBe(50_000)
    expect(slipGross(slip)).toBe(8_400_000 + 2_100_000 + 3 * 30_000 - 50_000)
    const shifts = [rec('hrs.shifts', 'SHF-O', 'active', { name: 'Office' })]
    const base = { 'mdm.employees': [me], 'hrs.shifts': shifts }
    // Monday 2 November 2026 is a working day for office staff; Sunday the 1st is not.
    expect(missingAttendance(base, '2026-11-02').map((a) => a.record)).toEqual([{ employee: me.id, date: '2026-11-02', shift: 'SHF-O', result: 'Absent', method: 'Mobile GPS', location: 'Otomatis: tidak clock in' }])
    expect(missingAttendance(base, '2026-11-01')).toEqual([])
    expect(missingAttendance({ ...base, 'hrs.attendance': [day('2026-11-02', 'On time')] }, '2026-11-02')).toEqual([])
    expect(missingAttendance({ ...base, 'hrs.leaves': [rec('hrs.leaves', 'LV-T', 'approved', { employee: me.id, from: '2026-10-30', days: 4 })] }, '2026-11-02')).toEqual([])
    expect(missingAttendance({ ...base, 'sys.holidays': [rec('sys.holidays', 'HOL-T', 'active', { date: '2026-11-02', kind: 'National holiday' })] }, '2026-11-02')).toEqual([])
  })
})

describe('plants and units', () => {
  const codes = (p: { lines: readonly Values[] }) => Object.fromEntries(p.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
  const plantOf = (entity: string) => seed['mdm.plants']!.find((p) => seed['mdm.companies']!.find((c) => c.id === p.values.company)?.values.entity === entity)!.id

  it('converts between a material unit and tonnes through its density', () => {
    const acid = { values: { uom: 'm³', density: 1.84 } }
    expect(toTonnes(10, acid)).toBe(18.4)
    expect(fromTonnes(18.4, acid)).toBe(10)
    expect(toTonnes(500, { values: { uom: 'kg' } })).toBe(0.5)
    expect(toTonnes(7, { values: { uom: 't' } })).toBe(7)
    expect(fromTonnes(1, { values: { uom: 'L', density: 0.5 } })).toBe(2000)
  })

  it('needs a liquid in cubic metres from a BOM written in kilograms per tonne', () => {
    const acid = seed['mdm.materials']!.find((m) => m.values.code === 'RM-PHA')!
    const bom = rec('bpf.bom', 'BOM-T', 'active', { formula: 'FRM-T', material: acid.id, kgPerT: 169, scrap: 0 })
    const order = rec('bpf.orders', 'PRD-T', 'released', { formula: 'FRM-T', qty: 10 })
    expect(bomNeeds(put({ ...seed, 'bpf.bom': [] }, bom), order)[0]!.qty).toBe(1)
  })

  it('weighs a liquid receipt in tonnes against its cubic metres', () => {
    const acid = seed['mdm.materials']!.find((m) => m.values.code === 'RM-H2SO4')!
    const po = rec('vms.orders', 'PO-T', 'released', { vendor: 'BP-0001', material: acid.id, qty: 100, value: 1e9 })
    const grn = rec('vms.receipts', 'GRN-T', 'quarantine', { po: po.id, qty: 10 })
    const ticket = (net: number) => rec('wms.weighings', 'WBT-T', 'completed', { receipt: grn.id, gross: 30, tare: 30 - net, net })
    expect(effectsFor(grn.type, grn, 'accepted', put(seed, po, grn, ticket(18.4)), today).blocker).toBeUndefined()
    expect(effectsFor(grn.type, grn, 'accepted', put(seed, po, grn, ticket(10)), today).blocker).toMatch(/Berat bersih/)
  })

  it('books stock documents to the unit that owns the plant', () => {
    const stock = seed['inv.stock']!.find((r) => r.values.plant === plantOf('chemicals'))!
    const adj = rec('inv.adjustments', 'ADJ-T', 'submitted', { stock: stock.id, qty: -1, reason: 'Spillage', value: 100_000 })
    expect(effectsFor(adj.type, adj, 'approved', seed, today).postings[0]!.journal.entity).toBe('chemicals')
  })

  it('moves stock between plants and books intercompany balances when the owner changes', () => {
    const material = seed['inv.stock']!.find((r) => r.values.plant === plantOf('chemicals'))!.values.material
    const from = plantOf('chemicals')
    const to = plantOf('fertiliser')
    const have = seed['inv.stock']!.filter((r) => r.values.material === material && r.values.plant === from).reduce((s, r) => s + Number(r.values.onHand), 0)
    const trf = (qty: number, toPlant = to) => rec('inv.transfers', 'TRF-T', 'draft', { material, from, to: toPlant, qty })
    expect(effectsFor('inv.transfers', trf(have + 1), 'transit', seed, today).blocker).toMatch(/kurang/)
    expect(effectsFor('inv.transfers', trf(1, from), 'transit', seed, today).blocker).toMatch(/berbeda/)
    expect(effectsFor('inv.transfers', trf(1), 'transit', seed, today).patches.length).toBeGreaterThan(0)
    const received = effectsFor('inv.transfers', { ...trf(2), status: 'transit' }, 'received', seed, today)
    expect(received.postings.map((p) => [p.journal.entity, Object.keys(codes(p)).sort()])).toEqual([['chemicals', ['1220', '1310']], ['fertiliser', ['1310', '2120']]])
  })

  it('scraps stock at its average cost and sends hazardous scrap to waste', () => {
    const stock = seed['inv.stock']![0]!
    const scr = (values: Values) => rec('inv.scrap', 'SCR-T', 'submitted', { material: stock.values.material, plant: stock.values.plant, qty: 1, reason: 'Expired', b3: 'Yes', ...values })
    const fx = effectsFor('inv.scrap', scr({}), 'approved', seed, today)
    expect(fx.patches[0]!.values.onHand).toBe(Number(stock.values.onHand) - 1)
    expect(codes(fx.postings[0]!)['5450']).toBeGreaterThan(0)
    expect(codes(fx.postings[0]!)['1310']).toBe(-codes(fx.postings[0]!)['5450']!)
    expect(fx.creates[0]!.type).toBe('she.waste')
    expect(effectsFor('inv.scrap', scr({ b3: 'No' }), 'approved', seed, today).creates).toEqual([])
    expect(effectsFor('inv.scrap', scr({ qty: 1e9 }), 'approved', seed, today).blocker).toMatch(/kurang/)
  })

  it('holds expired lots and keeps them out of production', () => {
    const material = String(seed['inv.stock']!.find((r) => Number(r.values.onHand) > 10)!.values.material)
    const lot = (id: string, expiry: string) => rec('wms.lots', id, 'stored', { lotNo: id, material, qty: 5, expiry })
    const all = { 'wms.lots': [lot('SL-OLD', '2026-10-01'), lot('SL-NEW', '2027-10-01')] }
    expect(expiredLots(all, today).map((l) => l.id)).toEqual(['SL-OLD'])
    const order = rec('bpf.orders', 'PRD-T', 'released', { formula: 'FRM-T', qty: 10 })
    const bom = rec('bpf.bom', 'BOM-T', 'active', { formula: 'FRM-T', material, kgPerT: 100, scrap: 0 })
    const taken = effectsFor('bpf.orders', order, 'running', put({ ...seed, 'wms.lots': [], 'bpf.bom': [] }, bom, ...all['wms.lots']), today).creates.filter((c) => c.type === 'gtr.movements')
    expect(taken.map((c) => c.values.lotNo)).toEqual(['SL-NEW'])
  })

  it('closes a chemical campaign into a finished lot and journals for the chemicals unit', () => {
    const cmp = rec('cfp.campaigns', 'CMP-T', 'running', { name: 'Uji', actual: 184, planned: 190 })
    const fx = effectsFor(cmp.type, cmp, 'closed', seed, today)
    expect(fx.postings.map((p) => p.journal.entity)).toEqual(['chemicals', 'chemicals'])
    expect(codes(fx.postings[1]!)).toEqual({ '1330': 184 * 580_000, '1320': -184 * 580_000 })
    expect(fx.creates[0]).toEqual(expect.objectContaining({ type: 'gtr.lots', values: expect.objectContaining({ lotNo: 'FG-CMP-T', qty: 100 }) }))
    expect(effectsFor(cmp.type, { ...cmp, values: { ...cmp.values, actual: 0 } }, 'closed', seed, today).blocker).toMatch(/hasil aktual/)
  })
})

describe('finance controls', () => {
  const codes = (p: { lines: readonly Values[] }) => Object.fromEntries(p.lines.map((l) => [code(seed, l.account), Number(l.debit) || -Number(l.credit)]))
  const acc = (c: string) => seed['mdm.accounts']!.find((a) => a.values.code === c)!.id

  it('stops a manual journal that runs an expense account past its budget to date', () => {
    const budget = rec('epm.budgets', 'BUD-T', 'approved', { entity: 'holding', year: 2026 })
    const line = rec('epm.budgetlines', 'BGL-T', 'active', { budget: budget.id, account: acc('6600'), amount: 120_000_000 })
    const journal = (amount: number) => [rec('fin.journals', 'JE-T', 'draft', { entity: 'holding', date: '2026-10-15', source: 'Manual', amount }), rec('fin.journallines', 'JL-T1', 'recorded', { journal: 'JE-T', account: acc('6600'), debit: amount, credit: 0 }), rec('fin.journallines', 'JL-T2', 'recorded', { journal: 'JE-T', account: acc('1120'), debit: 0, credit: amount })]
    // No other 6600 spend in this scenario: October allows ten twelfths of the year, Rp 100 million.
    const base = { ...seed, 'fin.journals': [], 'fin.journallines': [], 'epm.budgets': [budget], 'epm.budgetlines': [line] }
    expect(budgetBreaches(put(base, ...journal(100e6)), journal(100e6)[0]!)).toEqual([])
    expect(effectsFor('fin.journals', journal(101e6)[0]!, 'submitted', put(base, ...journal(101e6)), today).blocker).toMatch(/Melebihi anggaran: 6600/)
  })

  it('withholds PPh 22 and 4(2) to their own accounts and costs input VAT that cannot be credited', () => {
    const inv = (values: Values) => rec('fin.payables', 'API-T', 'matched', { invoiceNo: 'T', vendor: 'BP-0001', entity: 'holding', amount: 100e6, tax: 'PPN 11%', ...values })
    expect(codes(effectsFor('fin.payables', inv({ withholding: 'PPh 4(2) 10%' }), 'approved', seed, today).postings[0]!)['2240']).toBe(-10e6)
    expect(codes(effectsFor('fin.payables', inv({ withholding: 'PPh 22 1,5%' }), 'approved', seed, today).postings[0]!)['2250']).toBe(-1.5e6)
    const notCredited = codes(effectsFor('fin.payables', inv({ vatCredit: 'Not creditable' }), 'approved', seed, today).postings[0]!)
    expect(notCredited['1310']).toBe(111e6)
    expect(notCredited['1410']).toBeUndefined()
    expect(codes(effectsFor('fin.payables', inv({ vatCredit: 'Deferred' }), 'approved', seed, today).postings[0]!)['1415']).toBe(11e6)
  })

  it('numbers tax invoices in sequence within the year', () => {
    const invoice = rec('fin.receivables', 'ARI-T', 'issued', { due: '2026-12-01' })
    const tax = (number: string) => rec('fin.taxinvoices', `EFK-${number}`, 'draft', { number })
    expect(nextTaxSerial({ 'fin.taxinvoices': [tax('010.26.73100005'), tax('010.26.73100009'), tax('010.25.79999999')] }, invoice)).toBe('010.26.73100010')
    expect(nextTaxSerial({}, invoice)).toBe('010.26.73100001')
  })

  it('capitalises a vendor invoice once and keeps construction in progress out of depreciation', () => {
    const inv = rec('fin.payables', 'API-T', 'approved', { invoiceNo: 'T', amount: 50e6 })
    const asset = (values: Values) => rec('fin.assets', 'FA-T', 'active', { name: 'Uji', entity: 'chemicals', class: 'Construction in progress', cost: 50e6, life: 10, acquired: '2025-01-01', invoice: inv.id, ...values })
    const fx = effectsFor('fin.assets', asset({}), 'created', put(seed, inv), today)
    expect(codes(fx.postings[0]!)).toEqual({ '1560': 50e6, '1310': -50e6 })
    expect(effectsFor('fin.assets', asset({}), 'created', put(seed, inv, { ...asset({}), id: 'FA-U' }), today).blocker).toMatch(/sudah dikapitalisasi/)
    expect(assetBook(asset({}).values, today)).toEqual(expect.objectContaining({ accumulated: 0, yearly: 0 }))
  })

  it('transfers an asset between units at book value through intercompany accounts', () => {
    const asset = rec('fin.assets', 'FA-T', 'active', { name: 'Uji', entity: 'chemicals', class: 'Vehicles', cost: 100e6, life: 5, acquired: '2024-10-30', salvage: 0, method: 'Straight line' })
    const trf = rec('fin.assettransfers', 'FAT-T', 'submitted', { asset: asset.id, toEntity: 'logistics' })
    const fx = effectsFor(trf.type, trf, 'approved', put(seed, asset), today)
    expect(fx.postings.map((p) => [p.journal.entity, codes(p)])).toEqual([
      ['chemicals', { '1590': 40e6, '1220': 60e6, '1530': -100e6 }],
      ['logistics', { '1530': 100e6, '1590': -40e6, '2120': -60e6 }],
    ])
    expect(fx.patches[0]!.values).toEqual({ entity: 'logistics' })
  })

  it('compares commercial and tax depreciation by tax group', () => {
    expect(fiscalBook({ class: 'Vehicles', cost: 100e6, acquired: '2024-10-30' }, today)).toEqual({ group: 'Kelompok 2', accumulated: 43_750_000, book: 56_250_000 })
    expect(fiscalBook({ class: 'Buildings', cost: 100e6, acquired: '2024-10-30' }, today).book).toBe(90e6)
  })

  it('keeps a period open while close tasks, unposted journals or bank lines are left', () => {
    const company = seed['mdm.companies']!.find((c) => c.values.entity === 'holding')!
    const period = rec('epm.periods', 'FP-T', 'closing', { period: '2026-10', company: company.id })
    const empty = { ...seed, 'fin.closing': [], 'fin.journals': [], 'fin.statementlines': [] }
    expect(effectsFor(period.type, period, 'closed', empty, today).blocker).toBeUndefined()
    const blocked = put(empty, rec('fin.closing', 'PCL-T', 'open', { period: period.id }), rec('fin.journals', 'JE-T', 'draft', { entity: 'holding', date: '2026-10-20' }))
    expect(effectsFor(period.type, period, 'closed', blocked, today).blocker).toMatch(/1 tugas tutup buku belum selesai; 1 jurnal belum diposting \(JE-T\)/)
  })

  it('books a dunning fee and checks the credit limit again at shipment', () => {
    const invoice = rec('fin.receivables', 'ARI-T', 'overdue', { invoiceNo: 'T', entity: 'logistics', amount: 1e6 })
    expect(codes(effectsFor('fin.dunning', rec('fin.dunning', 'DUN-T', 'draft', { invoice: invoice.id, fee: 500_000 }), 'sent', put(seed, invoice), today).postings[0]!)).toEqual({ '1250': 500_000, '4900': -500_000 })
    const d = rec('dms.distributors', 'DST-T', 'active', { name: 'Uji', creditLimit: 100e6, outstanding: 80e6 })
    const so = (qty: number) => rec('dms.orders', 'SO-T', 'confirmed', { distributor: d.id, product: 'NPK 15-15-15', scheme: 'Commercial', qty, value: qty * 9e6, date: today })
    expect(effectsFor('dms.orders', so(3), 'shipped', put(seed, d), today).blocker).toMatch(/Limit kredit Uji terlampaui saat kirim/)
    expect(effectsFor('dms.orders', so(2), 'shipped', put(seed, d), today).blocker).toBeUndefined()
  })

  it('drops intercompany sales and splits profit with minority shareholders', () => {
    const ic = rec('epm.intercompany', 'ICE-T', 'matched', { from: 'fertiliser', to: 'logistics', amount: 2e9, date: '2026-06-01' })
    const base = consolidation({ ...seed, 'epm.intercompany': [] }, {}, OWNERSHIP)
    const withIc = consolidation(put({ ...seed, 'epm.intercompany': [] }, ic), {}, OWNERSHIP)
    expect(base.group.revenue - withIc.group.revenue).toBe(2e9)
    expect(withIc.group.net).toBe(base.group.net)
    const fert = base.units.find((u) => u.unit === 'fertiliser')!
    const chem = base.units.find((u) => u.unit === 'chemicals')!
    expect(base.minority.net).toBe(Math.round(fert.net * 0.15 + chem.net * 0.3))
  })
})

describe('people rules', () => {
  const emp = (values: Values) => rec('mdm.employees', 'EMP-T', 'active', { name: 'Uji', entity: 'holding', baseSalary: 10_000_000, allowance: 1_500_000, ptkp: 'TK/0', joined: '2020-01-01', crew: 'Office', ...values })

  it('hires an accepted candidate as employee with a first contract and onboarding tasks', () => {
    const candidate = rec('hrs.candidates', 'CAN-T', 'offer', { name: 'Kandidat Uji', position: 'JOB-0001' })
    const offer = rec('hrs.offers', 'OFR-T', 'sent', { candidate: candidate.id, position: 'JOB-0001', salary: 8e6, start: '2026-12-01' })
    const fx = effectsFor(offer.type, offer, 'accepted', put(seed, candidate), today)
    const [employee, contract, ...tasks] = fx.creates
    expect(employee).toEqual(expect.objectContaining({ type: 'mdm.employees', values: expect.objectContaining({ name: 'Kandidat Uji', joined: '2026-12-01', baseSalary: 8e6 }) }))
    const id = `EMP-${String(seed['mdm.employees']!.length + 1).padStart(4, '0')}`
    expect(contract!.values).toEqual(expect.objectContaining({ employee: id, kind: 'PKWT (fixed term)', start: '2026-12-01', end: '2027-11-30' }))
    expect(tasks.map((t) => t.values.task)).toEqual(['K3 induction', 'PPE issued', 'Site access card', 'Laptop and email', 'BPJS registration'])
    expect(fx.moves).toEqual([expect.objectContaining({ id: candidate.id, status: 'hired' })])
  })

  it('holds fixed-term contracts to five years and computes their compensation', () => {
    const contract = (id: string, start: string, end: string) => rec('hrs.contracts', id, 'active', { employee: 'EMP-T', kind: 'PKWT (fixed term)', start, end })
    const all = put(seed, emp({}), contract('KTR-A', '2022-01-01', '2025-12-31'))
    expect(effectsFor('hrs.contracts', contract('KTR-B', '2026-01-01', '2026-12-31'), 'created', all, today).blocker).toBeUndefined()
    expect(effectsFor('hrs.contracts', contract('KTR-B', '2026-01-01', '2027-06-30'), 'created', all, today).blocker).toMatch(/melebihi batas 5 tahun/)
    expect(effectsFor('hrs.contracts', { ...contract('KTR-B', '2026-01-01', ''), values: { employee: 'EMP-T', kind: 'PKWT (fixed term)', start: '2026-01-01' } }, 'created', all, today).blocker).toMatch(/tanggal berakhir/)
    expect(pkwtCompensation(12e6, '2025-01-01', '2026-01-01')).toBe(12e6)
    expect(effectsFor('hrs.contracts', contract('KTR-A', '2025-01-01', '2026-01-01'), 'ended', all, today).patches[0]!.values.compensation).toBe(11_500_000)
    expect(expiringContracts({ 'hrs.contracts': [contract('KTR-C', '2026-01-01', '2026-11-20'), contract('KTR-D', '2026-01-01', '2027-03-01')] }, today).map((c) => c.id)).toEqual(['KTR-C'])
  })

  it('reads KPI from punctuality, logbooks and incidents of the period', () => {
    const att = (date: string, result: string) => rec('hrs.attendance', `ATT-${date}`, 'verified', { employee: 'EMP-T', date, result })
    const log = (date: string, score: number) => rec('hrs.logbook', `LOG-${date}`, 'approved', { employee: 'EMP-T', date, score })
    const all = { 'hrs.attendance': [att('2026-08-03', 'On time'), att('2026-08-04', 'Late'), att('2026-08-05', 'On time'), att('2026-08-06', 'On time')], 'hrs.logbook': [log('2026-08-03', 80), log('2026-08-04', 90)], 'she.incidents': [rec('she.incidents', 'SIR-T', 'closed', { person: 'EMP-T', date: '2026-09-10' })] }
    expect(periodRange('2026 Q3')).toEqual(['2026-07-01', '2026-09-30'])
    expect(periodRange('2026 H1')).toEqual(['2026-01-01', '2026-06-30'])
    expect(periodRange('2026-02')).toEqual(['2026-02-01', '2026-02-28'])
    expect(kpiFor(all, 'EMP-T', '2026 Q3')).toEqual({ kpi: Math.round(75 * 0.5 + 85 * 0.5), safety: 75, days: 4, logs: 2, incidents: 1 })
    const card = rec('hrs.appraisals', 'APR-T', 'draft', { employee: 'EMP-T', period: '2026 Q3' })
    expect(effectsFor(card.type, card, 'created', { ...seed, ...all }, today).patches[0]!.values).toEqual({ kpi: 80, safety: 75 })
  })

  it('charges leave by working days and holds each leave type to its quota', () => {
    const annual = seed['hrs.leavetypes']!.find((t) => /annual/i.test(String(t.values.name)))!
    const marriage = seed['hrs.leavetypes']!.find((t) => /marriage/i.test(String(t.values.name)))!
    const leave = (id: string, type: string, from: string, days: number, status = 'draft') => rec('hrs.leaves', id, status, { employee: 'EMP-T', leaveType: type, from, days })
    const base = put({ ...seed, 'hrs.leaves': [], 'sys.holidays': [] }, emp({}))
    // Friday 20 November for four calendar days covers Saturday and Sunday: two working days.
    expect(chargedDays(base, leave('LV-T', annual.id, '2026-11-20', 4))).toBe(2)
    expect(chargedDays(put(base, rec('sys.holidays', 'HOL-T', 'active', { date: '2026-11-23', kind: 'National holiday' })), leave('LV-T', annual.id, '2026-11-20', 4))).toBe(1)
    expect(effectsFor('hrs.leaves', leave('LV-T', marriage.id, '2026-11-16', 4), 'created', base, today).blocker).toMatch(/Kuota Marriage leave 2026: 3 hari/)
    expect(effectsFor('hrs.leaves', leave('LV-T', marriage.id, '2026-11-16', 3), 'created', base, today).blocker).toBeUndefined()
  })

  it('carries up to six unused annual days into a year until the end of March', () => {
    const annual = seed['hrs.leavetypes']!.find((t) => /annual/i.test(String(t.values.name)))!
    const leave = (id: string, from: string, days: number) => rec('hrs.leaves', id, 'approved', { employee: 'EMP-T', leaveType: annual.id, from, days: days < 1 ? days : days })
    const all = put({ ...seed, 'hrs.leaves': [], 'sys.holidays': [] }, emp({}), leave('LV-A', '2025-03-03', 3), leave('LV-B', '2026-02-02', 2))
    expect(annualLeave(all, 'EMP-T', '2026', '2026-02-10')).toEqual(expect.objectContaining({ carry: 6, usableCarry: 6, entitlement: 18, taken: 2, left: 16 }))
    // After March only the carried days already used still count.
    expect(annualLeave(all, 'EMP-T', '2026', '2026-11-18')).toEqual(expect.objectContaining({ usableCarry: 2, entitlement: 14, left: 12 }))
  })

  it('prorates a mid-month joiner, pays severance with the final slip and runs a bonus', () => {
    const joiner = payslipFor(emp({ joined: '2026-11-16' }), '2026-11', {})
    expect(joiner.base).toBe(Math.round(10e6 * (15 / 30)))
    const off = rec('hrs.offboarding', 'OFB-T', 'completed', { employee: 'EMP-T', lastDay: '2026-11-10', severance: 120e6 })
    const leaver = payslipFor(emp({}), '2026-11', { 'hrs.offboarding': [off] })
    expect(leaver.base).toBe(Math.round(10e6 * (10 / 30)))
    expect(leaver).toEqual(expect.objectContaining({ severance: 120e6, severanceTax: severanceTax(120e6) }))
    expect(severanceTax(120e6)).toBe(2_500_000 + 3_000_000)
    expect(slipNet(leaver)).toBe(slipGross(leaver) - Number(leaver.bpjs) - Number(leaver.pph21) + 120e6 - 5_500_000)
    const run = rec('hrs.payroll', 'PAY-T', 'draft', { period: '2026-12', kind: 'Bonus', bonusPct: 50, entity: 'fertiliser' })
    const slips = effectsFor('hrs.payroll', run, 'calculated', seed, today).creates
    expect(slips.length).toBeGreaterThan(0)
    for (const c of slips) expect(c.values).toEqual(expect.objectContaining({ kind: 'Bonus', bpjs: 0 }))
  })
})
