/**
 * The two areas of the console. Back office is the ERP a role runs; "Area karyawan" is what every employee does for
 * themselves: attendance, leave, overtime, loans, payslips. A role with no back office menu only sees the employee area.
 */
import { isLead, type Role } from './erp'
import type { ErpRecord } from './records'

export type Area = 'backoffice' | 'employee'
export const AREA_LABEL: Record<Area, string> = { backoffice: 'Backoffice', employee: 'Area karyawan' }
export const EMPLOYEE_HOME = '/me'

const SELF_SERVICE_ONLY = /employee \(ess\)/i

/** Staff get both areas, the self-service employee role only its own, outside parties (vendors, drivers) only theirs. */
export function areasFor(role: Pick<Role, 'name' | 'external'>): readonly Area[] {
  if (SELF_SERVICE_ONLY.test(role.name)) return ['employee']
  return role.external ? ['backoffice'] : ['backoffice', 'employee']
}

export const areaOf = (pathname: string): Area => (pathname === EMPLOYEE_HOME || pathname.startsWith(`${EMPLOYEE_HOME}/`) ? 'employee' : 'backoffice')

export interface SelfItem {
  id: string
  label: string
  /** The record type listed on the page; pages without one (home, payslips, team, profile) have their own screen. */
  type?: string
  /** The employee files these themself. */
  create?: boolean
  /** The employee writes their own rows without a request form: clocking in and out. */
  clock?: boolean
  /** Only for roles that lead a team. */
  lead?: boolean
}

/** The employee menu, grouped the way the back office menu is. */
export const SELF_MENU: ReadonlyArray<[group: string, items: readonly SelfItem[]]> = [
  ['Utama', [
    { id: '', label: 'Beranda' },
    { id: 'announcements', label: 'Pengumuman', type: 'hrs.announcements' },
    { id: 'approvals', label: 'Persetujuan tim', lead: true },
  ]],
  ['Kehadiran', [
    { id: 'attendance', label: 'Absensi', type: 'hrs.attendance', clock: true },
    { id: 'leaves', label: 'Izin & cuti', type: 'hrs.leaves', create: true },
    { id: 'overtime', label: 'Lembur', type: 'hrs.overtime', create: true },
    { id: 'team', label: 'Shift tim', type: 'hrs.shiftswaps', create: true },
  ]],
  ['Keuangan', [
    { id: 'payslips', label: 'Slip gaji', type: 'hrs.payslips' },
    { id: 'loans', label: 'Pinjaman', type: 'hrs.loans', create: true },
    { id: 'advances', label: 'Kasbon', type: 'fin.advances', create: true },
  ]],
  ['Pengembangan', [
    { id: 'appraisals', label: 'KPI saya', type: 'hrs.appraisals' },
    { id: 'trainings', label: 'Pelatihan', type: 'hrs.trainings' },
  ]],
  ['K3', [
    { id: 'mcu', label: 'Cek kesehatan', type: 'she.mcu' },
    { id: 'licences', label: 'Lisensi K3', type: 'she.licences' },
    { id: 'ppe', label: 'APD saya', type: 'she.ppeissues' },
  ]],
  ['Akun', [{ id: 'profile', label: 'Profil saya' }]],
]

/** A role leads a team when its title says so; the administrator stands in for any lead. */
export const isSupervisor = (role: Pick<Role, 'id' | 'name'>) => role.id === 'admin' || isLead(role)

/** The employee menu a role sees: team approvals only for leads. */
export const selfMenuFor = (role: Pick<Role, 'id' | 'name'>) => SELF_MENU.map(([group, items]) => [group, items.filter((i) => !i.lead || isSupervisor(role))] as const)

export const selfItem = (id: string) => SELF_MENU.flatMap(([, items]) => items).find((i) => i.id === id)
export const selfPath = (id: string) => (id ? `${EMPLOYEE_HOME}/${id}` : EMPLOYEE_HOME)

/** A role may file a request for itself when it has the employee area and the type is one employees file. */
export const canFileOwn = (role: Pick<Role, 'name' | 'external'>, typeKey: string) =>
  areasFor(role).includes('employee') && SELF_MENU.some(([, items]) => items.some((i) => (i.create || i.clock) && i.type === typeKey))

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** The demo signs in as a role, so the role stands for one employee of its unit, the same one every time. */
export function employeeOf(role: Pick<Role, 'id' | 'entity'>, employees: readonly ErpRecord[]): ErpRecord | undefined {
  const active = employees.filter((e) => e.status === 'active')
  const pool = active.filter((e) => e.values.entity === role.entity)
  const from = pool.length ? pool : active
  return from[hash(role.id) % Math.max(1, from.length)]
}

/** The records of `list` that belong to the employee. */
export const ownRecords = (list: readonly ErpRecord[], employeeId: string) => list.filter((r) => r.values.employee === employeeId)

const ANNUAL_LEAVE_DAYS = 12

/** Annual leave left this year: the entitlement less approved days, and the days still waiting for a decision. */
export function leaveBalance(leaves: readonly ErpRecord[], year: string) {
  const days = (status: string) => leaves.filter((l) => l.status === status && String(l.values.from).startsWith(year)).reduce((s, l) => s + (Number(l.values.days) || 0), 0)
  const taken = days('approved')
  return { taken, waiting: days('submitted'), left: Math.max(0, ANNUAL_LEAVE_DAYS - taken) }
}

/** Colleagues in the employee's org unit, the employee included. */
export const teamOf = (me: ErpRecord, employees: readonly ErpRecord[]) => employees.filter((e) => e.status === 'active' && e.values.orgunit === me.values.orgunit)

/** Requests a supervisor decides from the employee area. */
export const TEAM_TYPES = ['hrs.leaves', 'hrs.overtime', 'hrs.shiftswaps'] as const

/** Requests of the supervisor's team that wait for a decision; their own requests go to their own superior. */
export function teamRequests(all: Readonly<Record<string, readonly ErpRecord[]>>, me: ErpRecord) {
  const team = new Set(teamOf(me, all['mdm.employees'] ?? []).map((e) => e.id))
  return TEAM_TYPES.flatMap((type) => (all[type] ?? []).filter((r) => r.status === 'submitted' && r.values.employee !== me.id && team.has(String(r.values.employee))).map((record) => ({ type, record })))
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)

/**
 * The shift an employee works on a date: crews rotate through the shift patterns week by week, Sunday is the rest day,
 * and an approved swap on that date gives each of the two the other's shift.
 */
export function shiftOn(employee: ErpRecord, date: string, shifts: readonly ErpRecord[], swaps: readonly ErpRecord[] = []): ErpRecord | undefined {
  const swap = swaps.find((s) => s.status === 'approved' && s.values.date === date && (s.values.employee === employee.id || s.values.partner === employee.id))
  const id = swap ? String(swap.values.employee === employee.id ? swap.values.partner : swap.values.employee) : employee.id
  const day = dayNumber(date)
  // 1970-01-01 was a Thursday, so day 3 is the first Sunday.
  if ((day + 4) % 7 === 0 || !shifts.length) return undefined
  return shifts[(hash(id) + Math.floor((day + 4) / 7)) % shifts.length]
}

/** The seven dates of the week (Monday first) that holds `date`. */
export function weekOf(date: string): string[] {
  const day = dayNumber(date)
  const monday = day - ((day + 3) % 7)
  return Array.from({ length: 7 }, (_, i) => new Date((monday + i) * 86_400_000).toISOString().slice(0, 10))
}

/** On time up to five minutes past the shift start. */
export function clockResult(time: string, shiftStart: string): 'On time' | 'Late' {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return minutes(time) > minutes(shiftStart) + 5 ? 'Late' : 'On time'
}
