import { subledgerTie } from '@/domain/ledger'
import { typeOf } from '@/domain/catalog'
import { computeValues, type ErpRecord, type Values } from '@/domain/records'

/**
 * Vendor invoices name their PO's vendor, and invoices still waiting for the three-way match bill half of the goods
 * their PO has accepted, so the match passes in the demo. Runs before the subledger tie, which reads approved invoices only.
 */
/** Finished goods are carried at the standard cost of the formula that makes them, so cost of sales starts at standard. */
export function carryStandards(all: Record<string, ErpRecord[]>) {
  const type = typeOf('inv.stock')!
  const name = new Map((all['mdm.materials'] ?? []).map((m) => [m.id, String(m.values.name)]))
  all['inv.stock'] = (all['inv.stock'] ?? []).map((row) => {
    const material = name.get(String(row.values.material)) ?? ''
    const formula = (all['bpf.formulas'] ?? []).find((f) => {
      const grade = String(f.values.grade)
      return material.includes(grade.startsWith('NPK') ? grade : (grade.split(' ')[0] ?? grade))
    })
    return formula ? { ...row, values: computeValues(type, { ...row.values, avgCost: Number(formula.values.costPerT) }) } : row
  })
}

export function alignPayables(all: Record<string, ErpRecord[]>) {
  // Allocation rows are seeded before the chart of accounts is known; give them the utilities expense account.
  const utilities = all['mdm.accounts']?.find((x) => x.values.code === '6500')?.id ?? ''
  all['fin.allocations'] = (all['fin.allocations'] ?? []).map((r) => ({ ...r, values: { ...r.values, account: utilities } }))
  const type = typeOf('fin.payables')!
  const orders = new Map((all['vms.orders'] ?? []).map((o) => [o.id, o]))
  const accepted = new Map<string, number>()
  for (const g of all['vms.receipts'] ?? []) if (g.status === 'accepted') accepted.set(String(g.values.po), (accepted.get(String(g.values.po)) ?? 0) + (Number(g.values.qty) || 0))
  const received = [...accepted].map(([po, qty]) => ({ po: orders.get(po)!, qty })).filter((x) => x.po)
  let turn = 0
  all['fin.payables'] = (all['fin.payables'] ?? []).map((inv) => {
    let values: Values = { ...inv.values, vendor: orders.get(String(inv.values.po))?.values.vendor ?? inv.values.vendor }
    if (inv.status === 'received' && values.currency !== 'USD' && received.length) {
      const { po, qty } = received[turn++ % received.length]!
      const worth = (Number(po.values.value) || 0) * Math.min(1, qty / Math.max(1, Number(po.values.qty) || 1))
      values = { ...values, po: po.id, vendor: po.values.vendor, amount: Math.max(1, Math.round((worth * 0.5) / 1e6)) * 1e6 }
    }
    return { ...inv, values: computeValues(type, values) }
  })
}

/**
 * The seeded invoices and the seeded ledger are drawn separately, so the receivable and payable control accounts would
 * not equal the open invoices. One opening adjustment per unit and control account, against retained earnings, makes the
 * ledger agree with the subledger from the first day.
 */
export function tieSubledgers(all: Record<string, ErpRecord[]>, at: string) {
  const account = (code: string) => all['mdm.accounts']!.find((a) => a.values.code === code)!.id
  const [journalType, lineType] = [typeOf('fin.journals')!, typeOf('fin.journallines')!]
  const base = { createdAt: at, updatedAt: at, history: [{ at, by: 'Migrasi data', action: 'Dibuat' }] }
  // Subsidy the state still owes: the seeded claims not yet paid, as one more control balance of the fertiliser plant.
  const subsidy = (all['dms.subsidyclaims'] ?? []).filter((c) => !['paid', 'rejected'].includes(c.status)).reduce((s, c) => s + (Number(c.values.amount) || 0), 0)
  const rows = [...subledgerTie(all), { entity: 'fertiliser', code: '1240', label: 'Piutang subsidi', difference: subsidy }]
  for (const row of rows) {
    if (!row.difference) continue
    const journal: ErpRecord = { ...base, id: `JE-${String(all['fin.journals']!.length + 1).padStart(4, '0')}`, type: journalType.key, status: 'posted', values: computeValues(journalType, { description: `Penyesuaian saldo awal ${row.label.toLowerCase()} ke buku pembantu`, entity: row.entity, date: at.slice(0, 10), source: 'Opening', reference: '', amount: Math.abs(row.difference) }) }
    all['fin.journals']!.push(journal)
    // A receivable grows on the debit side, a payable on the credit side; retained earnings takes the other side.
    const up = row.difference > 0 === (row.code !== '2110')
    for (const [code, debit] of [[row.code, up], ['3200', !up]] as const) {
      all['fin.journallines']!.push({ ...base, id: `JL-${String(all['fin.journallines']!.length + 1).padStart(4, '0')}`, type: lineType.key, status: lineType.workflow.initial, values: computeValues(lineType, { journal: journal.id, account: account(code), costcenter: '', debit: debit ? Math.abs(row.difference) : 0, credit: debit ? 0 : Math.abs(row.difference), memo: String(journal.values.description) }) })
    }
  }
}
