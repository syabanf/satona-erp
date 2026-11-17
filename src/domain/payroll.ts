/** Monthly payroll per employee: BPJS, PPh 21 by the effective-rate (TER) tables, loan installments and overtime. */
import type { ErpRecord, Values } from './records'
import { isRestDay } from './selfService'

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

/** Wage ceilings of the pension programme (JP) and of BPJS Kesehatan. */
const BPJS_CAP = { pension: 10_414_000, health: 12_000_000 } as const

/** Employee share of BPJS on base pay: old-age savings (JHT) 2%, pension (JP) 1% and health 1%, the last two up to their ceilings. */
export const bpjsOf = (base: number) => Math.round(base * 0.02 + Math.min(base, BPJS_CAP.pension) * 0.01 + Math.min(base, BPJS_CAP.health) * 0.01)

/** Employer share: JHT 3.7%, JP 2%, work accident (JKK) 0.24%, death (JKM) 0.30% and health 4%. */
export const employerBpjsOf = (base: number) => Math.round(base * (0.037 + 0.0024 + 0.003) + Math.min(base, BPJS_CAP.pension) * 0.02 + Math.min(base, BPJS_CAP.health) * 0.04)

/**
 * Overtime pay under PP 35/2021, hourly wage being the monthly wage over 173. On a working day the first hour pays 1.5
 * times and the rest twice. On a rest day or holiday (five-day week) hours one to eight pay twice, the ninth three times
 * and the tenth to twelfth four times.
 */
export function overtimePay(hours: number, monthlyWage: number, restDay = false) {
  const span = (from: number, to: number) => Math.max(0, Math.min(hours, to) - from)
  const factor = restDay ? span(0, 8) * 2 + span(8, 9) * 3 + span(9, 12) * 4 : span(0, 1) * 1.5 + span(1, 24) * 2
  return Math.round((monthlyWage / 173) * factor)
}

/** Plant allowances: per afternoon or night shift worked, per day present, and a monthly hazard allowance for plant crews. */
const ALLOWANCE = { shift: { Afternoon: 25_000, Night: 40_000 } as Record<string, number>, meal: 30_000, hazard: 750_000 } as const

const PTKP_BASE = 54_000_000
/** Tax-free income per year: Rp 54 million, plus Rp 4.5 million for a spouse and for each of up to three dependants. */
export function ptkpOf(status: string) {
  const [marital, dependants] = status.split('/')
  return PTKP_BASE + (marital === 'K' ? 4_500_000 : 0) + Math.min(3, Number(dependants) || 0) * 4_500_000
}

const BRACKETS: ReadonlyArray<[upTo: number, rate: number]> = [[60e6, 0.05], [250e6, 0.15], [500e6, 0.25], [5e9, 0.3], [Infinity, 0.35]]

/** PPh 21 for a full year under Article 17: gross less the 5% job expense (at most Rp 6 million) and PTKP, on progressive brackets. */
export function annualPph21(annualGross: number, ptkp: string) {
  const taxable = Math.floor(Math.max(0, annualGross - Math.min(annualGross * 0.05, 6_000_000) - ptkpOf(ptkp)) / 1000) * 1000
  let [tax, floor] = [0, 0]
  for (const [upTo, rate] of BRACKETS) {
    tax += Math.max(0, Math.min(taxable, upTo) - floor) * rate
    floor = upTo
  }
  return Math.round(tax)
}

/** THR: one month of base pay and fixed allowance after twelve months of service, prorated by months below that. */
export function thrOf(employee: ErpRecord, reference: string) {
  const months = Math.max(0, Math.floor((Date.parse(reference) - Date.parse(String(employee.values.joined ?? reference))) / (30.4375 * 86_400_000)))
  return Math.round((n(employee.values.baseSalary) + n(employee.values.allowance)) * Math.min(1, months / 12))
}

const n = (v: unknown) => Number(v) || 0

type All = Readonly<Record<string, readonly ErpRecord[]>>

/**
 * One employee's payslip for a period (YYYY-MM), read from the records: base and fixed allowance from the employee
 * master; shift and meal allowance from the days they clocked in; hazard allowance for plant crews; overtime approved in
 * the period at the working-day or rest-day rate; installments of approved loans. PPh 21 follows the TER table from
 * January to November; December settles the year under Article 17 against what the year's payslips already withheld.
 */
export function payslipFor(employee: ErpRecord, period: string, all: All): Values {
  const mine = (r: ErpRecord) => r.values.employee === employee.id && r.status === 'approved'
  const base = n(employee.values.baseSalary)
  const allowance = n(employee.values.allowance)
  const ptkp = String(employee.values.ptkp ?? 'TK/0')
  const holidays = all['sys.holidays'] ?? []
  const extra = (all['hrs.overtime'] ?? []).filter((o) => mine(o) && String(o.values.date).startsWith(period)).reduce((s, o) => s + overtimePay(n(o.values.hours), base + allowance, isRestDay(employee, String(o.values.date), holidays)), 0)
  const shiftName = new Map((all['hrs.shifts'] ?? []).map((s) => [s.id, String(s.values.name)]))
  const present = (all['hrs.attendance'] ?? []).filter((a) => a.values.employee === employee.id && String(a.values.date).startsWith(period) && ['On time', 'Late'].includes(String(a.values.result)))
  const shiftAllowance = present.reduce((s, a) => s + (ALLOWANCE.shift[shiftName.get(String(a.values.shift)) ?? ''] ?? 0), 0)
  const plantCrew = Boolean(employee.values.crew) && employee.values.crew !== 'Office'
  const values = { base, allowance, overtime: extra, shiftAllowance, meal: present.length * ALLOWANCE.meal, hazard: plantCrew ? ALLOWANCE.hazard : 0 }
  const gross = slipGross(values)
  const year = (all['hrs.payslips'] ?? []).filter((p) => p.values.employee === employee.id && String(p.values.period).startsWith(period.slice(0, 4)) && p.values.period !== period)
  const settled = Math.max(0, annualPph21(year.reduce((s, p) => s + slipGross(p.values), 0) + gross, ptkp) - year.reduce((s, p) => s + n(p.values.pph21), 0))
  return {
    employee: employee.id,
    period,
    kind: 'Regular',
    entity: employee.values.entity,
    ...values,
    bpjs: bpjsOf(base),
    pph21: period.endsWith('-12') ? settled : pph21(gross, ptkp),
    loan: (all['hrs.loans'] ?? []).filter(mine).reduce((s, l) => s + n(l.values.installment), 0),
  }
}

/** The THR payslip of an employee: the bonus itself, taxed at its TER rate, with no BPJS and no loan deduction. */
export function thrSlipFor(employee: ErpRecord, period: string, reference: string): Values {
  const thr = thrOf(employee, reference)
  return { employee: employee.id, period, kind: 'THR', entity: employee.values.entity, base: thr, allowance: 0, overtime: 0, bpjs: 0, pph21: pph21(thr, String(employee.values.ptkp ?? 'TK/0')), loan: 0 }
}

/** Months of wage per completed year band: severance pay (uang pesangon) and long-service pay (UPMK), PP 35/2021 articles 40. */
const pesangonMonths = (years: number) => Math.min(9, Math.floor(years) + 1)
const upmkMonths = (years: number) => (years < 3 ? 0 : years >= 24 ? 10 : Math.min(8, Math.floor(years / 3) + 1))
/** How much of each component a separation reason pays: [severance, long service]. */
export const SEPARATION: Record<string, readonly [number, number]> = {
  Voluntary: [0, 0],
  'End of contract': [0, 0],
  Layoff: [0.5, 1],
  Termination: [1, 1],
  Retirement: [1.75, 1],
}

/**
 * Final settlement by separation reason. A fixed-term contract that ends pays compensation of one month per twelve
 * months worked instead; a resignation pays neither component (separation pay follows company policy).
 */
export function severanceOf(wage: number, years: number, reason: string) {
  const [s, u] = SEPARATION[reason] ?? [0, 0]
  const severance = Math.round(pesangonMonths(years) * wage * s)
  const service = Math.round(upmkMonths(years) * wage * u)
  const compensation = reason === 'End of contract' ? Math.round(wage * Math.min(5, years)) : 0
  return { severance, service, compensation, total: severance + service + compensation }
}

export const slipGross = (v: Values) => n(v.base) + n(v.allowance) + n(v.overtime) + n(v.shiftAllowance) + n(v.meal) + n(v.hazard)
export const slipNet = (v: Values) => slipGross(v) - n(v.bpjs) - n(v.pph21) - n(v.loan)
