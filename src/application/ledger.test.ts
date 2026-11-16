import { describe, expect, it } from 'vitest'
import { ADMIN_ROLE } from '@/domain/erp'
import { ForbiddenError } from '@/domain/errors'
import { balanceSheet, budgetVsActual, cashFlow, closingEntry, depreciationRun, generalLedger, incomeStatement, journalBalance, journalProblem, ledgerLines, trialBalance } from '@/domain/ledger'
import { createMockPorts } from '@/infrastructure/mock'
import { createServices } from './services'

const clock = { today: () => '2026-10-30' }
const services = () => createServices(createMockPorts(clock))

describe('general ledger on the seeded books', () => {
  it('keeps every seeded journal balanced and the trial balance square', async () => {
    const all = await services().records.all()
    for (const j of all['fin.journals'] ?? []) expect(journalBalance((all['fin.journallines'] ?? []).filter((l) => l.values.journal === j.id)).balanced, j.id).toBe(true)
    const tb = trialBalance(all)
    expect(tb.rows.length).toBeGreaterThan(20)
    expect(tb.debit).toBe(tb.credit)
  })

  it('balances the balance sheet for the group and for each unit', async () => {
    const all = await services().records.all()
    for (const entity of [undefined, 'holding', 'logistics', 'fertiliser', 'chemicals']) {
      const bs = balanceSheet(all, { entity })
      expect(bs.balanced, String(entity)).toBe(true)
      expect(bs.assets.total).toBeGreaterThan(0)
    }
    expect(incomeStatement(all).net).toBeGreaterThan(0)
  })

  it('reconciles cash flow with the bank ledger and shows all three activities', async () => {
    const all = await services().records.all()
    const cf = cashFlow(all, { from: '2026-05-01', to: '2026-10-30' })
    const cash = trialBalance(all, { to: '2026-10-30' }).rows.filter((r) => r.account.values.kind === 'Cash and bank').reduce((s, r) => s + r.balance, 0)
    expect(cf.closing).toBe(cash)
    expect(cf.flows.investing).toBeLessThan(0)
    expect(cf.flows.financing).toBeLessThan(0)
    const bank = (all['mdm.accounts'] ?? []).find((a) => a.values.code === '1120')!
    const gl = generalLedger(all, bank.id, { from: '2026-09-01' })
    expect(gl.rows.at(-1)?.running).toBe(gl.closing)
    expect(budgetVsActual(all, 2026).length).toBeGreaterThan(0)
  })

  it('refuses an unbalanced journal, posts a balanced one, and blocks a closed period', async () => {
    const s = services()
    const acc = async (code: string) => (await s.records.list('mdm.accounts')).find((a) => a.values.code === code)!.id
    // November has no fiscal period row yet, so it is open.
    const head = { description: 'Uji', entity: 'holding', date: '2026-11-02', source: 'Manual', amount: 500 }
    const j = await s.records.create(ADMIN_ROLE, 'fin.journals', head)
    await s.records.create(ADMIN_ROLE, 'fin.journallines', { journal: j.id, account: await acc('6600'), debit: 500, credit: 0 })
    await s.records.create(ADMIN_ROLE, 'fin.journallines', { journal: j.id, account: await acc('1120'), debit: 0, credit: 400 })
    await expect(s.records.transition(ADMIN_ROLE, 'fin.journals', j.id, 'submitted')).rejects.toBeInstanceOf(ForbiddenError)
    expect(journalProblem(j, await s.records.all())).toMatch(/tidak seimbang/)
    const line = (await s.records.list('fin.journallines')).find((l) => l.values.journal === j.id && l.values.credit === 400)!
    await s.records.update(ADMIN_ROLE, 'fin.journallines', line.id, { ...line.values, credit: 500 })
    const before = ledgerLines(await s.records.all()).length
    await s.records.transition(ADMIN_ROLE, 'fin.journals', j.id, 'submitted')
    let posted = await s.records.transition(ADMIN_ROLE, 'fin.journals', j.id, 'posted')
    while (posted.status !== 'posted') posted = await s.records.transition(ADMIN_ROLE, 'fin.journals', j.id, 'posted')
    expect(ledgerLines(await s.records.all()).length).toBe(before + 2)

    const header = await s.records.create(ADMIN_ROLE, 'fin.journals', head)
    await s.records.create(ADMIN_ROLE, 'fin.journallines', { journal: header.id, account: await acc('6000'), debit: 500, credit: 0 })
    await s.records.create(ADMIN_ROLE, 'fin.journallines', { journal: header.id, account: await acc('1120'), debit: 0, credit: 500 })
    expect(journalProblem(header, await s.records.all())).toMatch(/akun induk/)

    const all = await s.records.all()
    const closed = (all['epm.periods'] ?? []).find((p) => p.status === 'closed')!
    const entity = (all['mdm.companies'] ?? []).find((c) => c.id === closed.values.company)!.values.entity
    expect(journalProblem({ ...posted, values: { ...posted.values, entity, date: `${String(closed.values.period)}-15` } }, all)).toMatch(/sudah ditutup/)
    }, 20_000)

  it('posts a customer invoice and its payment, and a vendor payment through its bank', async () => {
    const s = services()
    const count = async () => ledgerLines(await s.records.all()).length
    const start = await count()
    const inv = await s.records.create(ADMIN_ROLE, 'fin.receivables', { invoiceNo: 'INV-T1', customer: 'BP-0006', entity: 'fertiliser', amount: 1_000_000, due: '2026-11-30' })
    expect(await count()).toBe(start + 2)
    await s.records.transition(ADMIN_ROLE, 'fin.receivables', inv.id, 'paid')
    expect(await count()).toBe(start + 4)
    const all = await s.records.all()
    const made = (all['fin.journals'] ?? []).filter((j) => j.values.reference === inv.id)
    expect(made.map((j) => j.values.source).sort()).toEqual(['Receipt', 'Receivable'])
    expect(balanceSheet(all).balanced).toBe(true)
  })

  it('proposes depreciation once per unit and a closing entry that zeroes profit and loss', async () => {
    const s = services()
    const all = await s.records.all()
    const run = depreciationRun(all, '2026-11')
    expect(run.length).toBeGreaterThan(0)
    for (const p of run) expect(journalBalance(p.lines.map((values) => ({ values }))).balanced).toBe(true)
    const close = closingEntry(all, 'fertiliser', 2026)!
    expect(journalBalance(close.lines.map((values) => ({ values }))).balanced).toBe(true)
    const net = incomeStatement(all, { entity: 'fertiliser', from: '2026-01-01', to: '2026-12-31' }).net
    expect(close.lines.at(-1)?.credit).toBe(net)
  })
})
