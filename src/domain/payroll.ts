/** Monthly payroll per employee: BPJS, PPh 21 by the effective-rate (TER) tables, loan installments and overtime. */
import type { ErpRecord, Values } from './records'

export const PTKP = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'] as const

/** TER category by family status (PP 58/2023): A for TK/0, TK/1 and K/0, B for TK/2, TK/3, K/1 and K/2, C for K/3. */
export const terCategory = (ptkp: string): 'A' | 'B' | 'C' => (ptkp === 'K/3' ? 'C' : ['TK/2', 'TK/3', 'K/1', 'K/2'].includes(ptkp) ? 'B' : 'A')

/** Monthly gross up to the bound (in million rupiah) takes the rate (in percent). Above the last bound the demo holds the top rate of the table. */
const TER: Record<'A' | 'B' | 'C', ReadonlyArray<[upTo: number, rate: number]>> = {
  A: [[5.4, 0], [5.65, 0.25], [5.95, 0.5], [6.3, 0.75], [6.75, 1], [7.5, 1.25], [8.55, 1.5], [9.65, 1.75], [10.05, 2], [10.35, 2.25], [10.7, 2.5], [11.05, 3], [11.6, 3.5], [12.5, 4], [13.75, 5], [15.1, 6], [16.95, 7], [19.75, 8], [24.15, 9], [26.45, 10], [28, 11], [30.05, 12], [32.4, 13], [35.4, 14], [39.1, 15]],
  B: [[6.2, 0], [6.5, 0.25], [6.85, 0.5], [7.3, 0.75], [9.2, 1], [10.75, 1.5], [11.25, 2], [11.6, 2.5], [12.6, 3], [13.6, 4], [14.95, 5], [16.4, 6], [18.45, 7], [21.85, 8], [26, 9], [27.7, 10], [29.35, 11], [31.45, 12], [33.95, 13], [37.1, 14], [41.1, 15]],
  C: [[6.6, 0], [6.95, 0.25], [7.35, 0.5], [7.8, 0.75], [8.85, 1], [9.8, 1.25], [10.95, 1.5], [11.2, 1.75], [12.05, 2], [12.95, 3], [14.15, 4], [15.55, 5], [17.05, 6], [19.5, 7], [22.7, 8], [26.6, 9], [28.1, 10], [30.1, 11], [32.6, 12], [35.4, 13], [38.9, 14], [43, 15]],
}

/** The TER rate in percent for a monthly gross and family status. */
export function terRate(gross: number, ptkp: string): number {
  const table = TER[terCategory(ptkp)]
  return (table.find(([upTo]) => gross <= upTo * 1e6) ?? table.at(-1)!)[1]
}

export const pph21 = (gross: number, ptkp: string) => Math.round((gross * terRate(gross, ptkp)) / 100)

/** Employee share of BPJS: health 1%, old-age savings 2% and pension 1% of base pay. */
export const bpjsOf = (base: number) => Math.round(base * 0.04)

const n = (v: unknown) => Number(v) || 0

/**
 * One employee's payslip for a period (YYYY-MM): base and allowance from the employee master, overtime approved in the
 * period, and the installments of approved loans.
 */
export function payslipFor(employee: ErpRecord, period: string, overtime: readonly ErpRecord[], loans: readonly ErpRecord[]): Values {
  const mine = (r: ErpRecord) => r.values.employee === employee.id && r.status === 'approved'
  const base = n(employee.values.baseSalary)
  const allowance = n(employee.values.allowance)
  const extra = overtime.filter((o) => mine(o) && String(o.values.date).startsWith(period)).reduce((s, o) => s + n(o.values.pay), 0)
  return {
    employee: employee.id,
    period,
    entity: employee.values.entity,
    base,
    allowance,
    overtime: extra,
    bpjs: bpjsOf(base),
    pph21: pph21(base + allowance + extra, String(employee.values.ptkp ?? 'TK/0')),
    loan: loans.filter(mine).reduce((s, l) => s + n(l.values.installment), 0),
  }
}

export const slipGross = (v: Values) => n(v.base) + n(v.allowance) + n(v.overtime)
export const slipNet = (v: Values) => slipGross(v) - n(v.bpjs) - n(v.pph21) - n(v.loan)
