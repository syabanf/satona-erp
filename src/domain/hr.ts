/**
 * People rules on top of the document rules: hiring from an accepted offer, fixed-term contract limits, KPI read from
 * attendance, logbooks and incidents, and leave quotas per type. A rule here adds to the base rules of the same step.
 */
import type { Effects } from './effects'
import type { ErpRecord } from './records'
import { isRestDay } from './selfService'

type All = Readonly<Record<string, readonly ErpRecord[]>>
type Rule = (record: ErpRecord, all: All, today: string) => Partial<Effects> | undefined

const n = (v: unknown) => Number(v) || 0
const list = (all: All, type: string) => all[type] ?? []
const find = (all: All, type: string, id: unknown) => list(all, type).find((r) => r.id === id)
const DAY = 86_400_000
const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
/** Calendar months from one date to another: whole months, plus leftover days as a share of thirty. */
const months = (from: string, to: string) => {
  const whole = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))
  return Math.max(0, whole + (Number(to.slice(8, 10)) - Number(from.slice(8, 10))) / 30)
}

/** A fixed-term contract may run at most five years, extensions included (PP 35/2021). */
const PKWT_MAX_MONTHS = 60
const ONBOARDING = ['K3 induction', 'PPE issued', 'Site access card', 'Laptop and email', 'BPJS registration'] as const

/** The id the next record of a type will take, as the record store numbers them. */
const nextId = (all: All, type: string, prefix: string) => `${prefix}-${String(list(all, type).reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1).padStart(4, '0')}`

/** First and last day of a period written as YYYY-MM, YYYY Qn, YYYY H1/H2 or a bare year. */
export function periodRange(period: string): [string, string] {
  const [year, part = ''] = period.trim().split(/[\s-]+/)
  const span = (a: number, b: number) => [`${year}-${String(a).padStart(2, '0')}-01`, new Date(Date.UTC(Number(year), b, 0)).toISOString().slice(0, 10)] as [string, string]
  if (/^\d{2}$/.test(part)) return span(Number(part), Number(part))
  if (/^Q[1-4]$/i.test(part)) return span(Number(part[1]) * 3 - 2, Number(part[1]) * 3)
  if (/^H[12]$/i.test(part)) return part.toUpperCase() === 'H1' ? span(1, 6) : span(7, 12)
  return span(1, 12)
}

/**
 * KPI of an employee over a period, from the records: half from punctuality (days on time out of days present), half
 * from the average daily logbook score. Safety starts at 100 and loses 25 for every incident the employee was in.
 */
export function kpiFor(all: All, employeeId: string, period: string) {
  const [from, to] = periodRange(period)
  const within = (d: unknown) => String(d) >= from && String(d) <= to
  const days = list(all, 'hrs.attendance').filter((a) => a.values.employee === employeeId && within(a.values.date) && ['On time', 'Late'].includes(String(a.values.result)))
  const punctual = days.length ? (days.filter((a) => a.values.result === 'On time').length / days.length) * 100 : 100
  const logs = list(all, 'hrs.logbook').filter((l) => l.values.employee === employeeId && within(l.values.date) && l.status !== 'rejected')
  const logbook = logs.length ? logs.reduce((s, l) => s + n(l.values.score), 0) / logs.length : punctual
  const incidents = list(all, 'she.incidents').filter((i) => i.values.person === employeeId && within(i.values.date)).length
  return { kpi: Math.round(punctual * 0.5 + logbook * 0.5), safety: Math.max(0, 100 - incidents * 25), days: days.length, logs: logs.length, incidents }
}

/** The days a leave request charges: calendar days from its start, less the employee's rest days and public holidays. */
export function chargedDays(all: All, leave: ErpRecord) {
  const employee = find(all, 'mdm.employees', leave.values.employee)
  const span = Math.max(1, Math.ceil(n(leave.values.days)))
  if (!employee) return n(leave.values.days)
  const holidays = list(all, 'sys.holidays')
  const working = Array.from({ length: span }, (_, i) => plusDays(String(leave.values.from), i)).filter((d) => !isRestDay(employee, d, holidays)).length
  // A half day stays a half day.
  return n(leave.values.days) < 1 ? n(leave.values.days) : working
}

const ANNUAL_DAYS = 12
const CARRY_MAX = 6

/**
 * Annual leave of a year: twelve days (one per month from the joining month in the first year), plus up to six days
 * left from last year, which must be taken by the end of March.
 */
export function annualLeave(all: All, employeeId: string, year: string, asOf: string, except?: string) {
  const employee = find(all, 'mdm.employees', employeeId)
  const annual = list(all, 'hrs.leavetypes').find((t) => /annual/i.test(String(t.values.name)))?.id
  const leaves = list(all, 'hrs.leaves').filter((l) => l.values.employee === employeeId && l.values.leaveType === annual && l.id !== except)
  const joined = String(employee?.values.joined ?? '')
  const earned = (y: string) => (joined.startsWith(y) ? Math.min(ANNUAL_DAYS, 13 - Number(joined.slice(5, 7))) : joined > `${y}-12-31` ? 0 : ANNUAL_DAYS)
  const taken = (y: string, status: string, until = `${y}-12-31`) => leaves.filter((l) => l.status === status && String(l.values.from).startsWith(y) && String(l.values.from) <= until).reduce((s, l) => s + chargedDays(all, l), 0)
  const last = String(Number(year) - 1)
  const carry = Math.min(CARRY_MAX, Math.max(0, earned(last) - taken(last, 'approved')))
  // After March the carried days lapse, except those already used by then.
  const usableCarry = asOf > `${year}-03-31` ? Math.min(carry, taken(year, 'approved', `${year}-03-31`)) : carry
  const entitlement = earned(year) + usableCarry
  const used = taken(year, 'approved')
  return { entitlement, carry, usableCarry, taken: used, waiting: taken(year, 'submitted'), left: Math.max(0, entitlement - used) }
}

/** Why a leave request cannot be filed: it passes the annual balance, or the yearly quota of its leave type. */
function leaveProblem(all: All, leave: ErpRecord, today: string) {
  const type = find(all, 'hrs.leavetypes', leave.values.leaveType)
  if (!type) return undefined
  const year = String(leave.values.from).slice(0, 4)
  const days = chargedDays(all, leave)
  if (/annual/i.test(String(type.values.name))) {
    const b = annualLeave(all, String(leave.values.employee), year, today, leave.id)
    const free = b.left - b.waiting
    return days > free ? `Sisa cuti tahunan ${year} tinggal ${Math.max(0, free)} hari (hak ${b.entitlement}${b.usableCarry ? `, termasuk ${b.usableCarry} hari sisa tahun lalu` : ''}, terpakai ${b.taken}, menunggu ${b.waiting}). Permintaan ini ${days} hari kerja.` : undefined
  }
  const quota = n(type.values.days)
  if (!quota || type.values.paid === 'No') return undefined
  const used = list(all, 'hrs.leaves').filter((l) => l.id !== leave.id && l.values.employee === leave.values.employee && l.values.leaveType === type.id && ['approved', 'submitted'].includes(l.status) && String(l.values.from).startsWith(year)).reduce((s, l) => s + chargedDays(all, l), 0)
  return used + days > quota ? `Kuota ${String(type.values.name)} ${year}: ${quota} hari, sudah dipakai atau diajukan ${used}, permintaan ini ${days}.` : undefined
}

/** Months of fixed-term work an employee has, the contract being checked included (it is not stored yet when created). */
function pkwtMonths(all: All, contract: ErpRecord) {
  const others = list(all, 'hrs.contracts').filter((c) => c.id !== contract.id && c.values.employee === contract.values.employee && String(c.values.kind).startsWith('PKWT ('))
  return [...others, contract].reduce((s, c) => s + months(String(c.values.start), String(c.values.end || c.values.start)), 0)
}

/** PKWT compensation at the end of a contract: one month of wages for each twelve months worked, prorated. */
export const pkwtCompensation = (wage: number, start: string, end: string) => Math.round((months(start, end) / 12) * wage)

export const HR_RULES: Record<string, Rule> = {
  // An accepted offer hires the candidate: the employee record, a first fixed-term contract and the onboarding checklist.
  'hrs.offers:accepted': (offer, all) => {
    const candidate = find(all, 'hrs.candidates', offer.values.candidate)
    if (!candidate) return undefined
    if (list(all, 'mdm.employees').some((e) => e.values.name === candidate.values.name && e.values.position === offer.values.position)) return undefined
    const position = find(all, 'hrs.positions', offer.values.position)
    const unit = find(all, 'hrs.orgunits', position?.values.orgunit)
    const employee = nextId(all, 'mdm.employees', 'EMP')
    const start = String(offer.values.start)
    const salary = n(offer.values.salary)
    return {
      creates: [
        { type: 'mdm.employees', values: { nik: `NEW-${employee.slice(4)}`, name: candidate.values.name, entity: unit?.values.entity ?? 'holding', department: String(unit?.values.name ?? 'Operations'), orgunit: position?.values.orgunit, position: offer.values.position, employment: 'Fixed term', joined: start, baseSalary: salary, allowance: Math.round(salary * 0.15), ptkp: 'TK/0', crew: 'Office' } },
        { type: 'hrs.contracts', values: { employee, kind: 'PKWT (fixed term)', start, end: plusDays(start, 364) } },
        ...ONBOARDING.map((task, i) => ({ type: 'hrs.onboarding', values: { employee, kind: 'Onboarding', task, due: plusDays(start, i < 2 ? 0 : 7) } })),
      ],
    }
  },

  // Fixed-term contracts: an end date, and no more than five years in all.
  'hrs.contracts:created': (contract, all) => {
    if (!String(contract.values.kind).startsWith('PKWT (')) return undefined
    if (!contract.values.end) return { blocker: 'Kontrak PKWT wajib punya tanggal berakhir.' }
    const total = pkwtMonths(all, contract)
    return total > PKWT_MAX_MONTHS ? { blocker: `Total PKWT karyawan ini menjadi ${Math.round(total)} bulan, melebihi batas 5 tahun. Angkat menjadi PKWTT.` } : undefined
  },
  'hrs.contracts:ended': (contract, all) => {
    if (!String(contract.values.kind).startsWith('PKWT (')) return undefined
    const employee = find(all, 'mdm.employees', contract.values.employee)
    const wage = n(employee?.values.baseSalary) + n(employee?.values.allowance)
    const compensation = pkwtCompensation(wage, String(contract.values.start), String(contract.values.end || contract.values.start))
    return { patches: [{ type: contract.type, id: contract.id, values: { compensation }, action: `Kompensasi PKWT ${compensation.toLocaleString('id-ID')}` }] }
  },

  // A scorecard filed without figures takes them from the records of its period.
  'hrs.appraisals:created': (card, all) => {
    if (card.values.kpi !== undefined && card.values.kpi !== '') return undefined
    const k = kpiFor(all, String(card.values.employee), String(card.values.period))
    return { patches: [{ type: card.type, id: card.id, values: { kpi: k.kpi, safety: card.values.safety === undefined || card.values.safety === '' ? k.safety : card.values.safety }, action: `KPI dari ${k.days} hari absensi, ${k.logs} logbook, ${k.incidents} insiden` }] }
  },

  'hrs.leaves:created': (leave, all, today) => blockedBy(leaveProblem(all, leave, today)),
  'hrs.leaves:submitted': (leave, all, today) => blockedBy(leaveProblem(all, leave, today)),
}

const blockedBy = (reason: string | undefined) => (reason ? { blocker: reason } : undefined)

/** Fixed-term contracts that end within `days` and are not yet flagged for renewal. */
export function expiringContracts(all: All, today: string, days = 30) {
  return list(all, 'hrs.contracts').filter((c) => c.status === 'active' && String(c.values.kind).startsWith('PKWT (') && c.values.end && String(c.values.end) <= plusDays(today, days)).toSorted((a, b) => String(a.values.end).localeCompare(String(b.values.end)))
}

