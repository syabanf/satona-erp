/** Performance cycles: who reviews whom in a 360 round, what the round says, and how review ratings spread per department. */
import type { ErpRecord, Values } from './records'

type All = Readonly<Record<string, readonly ErpRecord[]>>

const LEADER = /manager|supervisor|superintendent|head|kepala/i
/** A subject's peer and report averages stay hidden below this many reviews, so no single reviewer can be identified. */
export const MIN_REVIEWERS = 3
const PEERS = 3

/**
 * The 360 reviews to open for an org unit: every member reviews themself, the unit's leader reviews each member, each
 * member reviews the leader, and up to three peers review each other. Pairs that already have an open review are skipped.
 */
export function feedbackAssignments(all: All, orgunit: string): Values[] {
  const team = (all['mdm.employees'] ?? []).filter((e) => e.status === 'active' && e.values.orgunit === orgunit)
  const title = (e: ErpRecord) => String((all['hrs.positions'] ?? []).find((p) => p.id === e.values.position)?.values.title ?? '')
  const leader = team.find((e) => LEADER.test(title(e))) ?? team[0]
  const open = new Set((all['hrs.feedback360'] ?? []).filter((f) => f.status === 'pending').map((f) => `${String(f.values.employee)}>${String(f.values.subject)}`))
  const rows: Values[] = []
  const add = (reviewer: ErpRecord, subject: ErpRecord, relation: string) => {
    const key = `${reviewer.id}>${subject.id}`
    if (open.has(key)) return
    open.add(key)
    rows.push({ employee: reviewer.id, subject: subject.id, relation, comment: '' })
  }
  team.forEach((subject, i) => {
    add(subject, subject, 'Self')
    if (leader && leader.id !== subject.id) {
      add(leader, subject, 'Manager')
      add(subject, leader, 'Direct report')
    }
    const others = team.filter((e) => e.id !== subject.id && e.id !== leader?.id)
    for (let k = 0; k < Math.min(PEERS, others.length); k++) add(others[(i + k) % others.length]!, subject, 'Peer')
  })
  return rows
}

/** Per reviewed employee: reviews handed in, the average score, and whether enough reviewers answered to show it. */
export function feedbackSummary(all: All) {
  const by = new Map<string, { done: number; pending: number; sum: number }>()
  for (const f of all['hrs.feedback360'] ?? []) {
    const row = by.get(String(f.values.subject)) ?? { done: 0, pending: 0, sum: 0 }
    const done = f.status !== 'pending' && Number(f.values.score) > 0
    by.set(String(f.values.subject), { done: row.done + Number(done), pending: row.pending + Number(!done), sum: row.sum + (done ? Number(f.values.score) : 0) })
  }
  return [...by].map(([subject, r]) => ({ subject, ...r, visible: r.done >= MIN_REVIEWERS, average: r.done ? Math.round((r.sum / r.done) * 10) / 10 : 0 })).sort((a, b) => b.done - a.done)
}

export const BANDS = ['Istimewa', 'Baik', 'Cukup', 'Perlu pembinaan'] as const

/** Review ratings of a period per department, with the share of top ratings a calibration session looks at first. */
export function calibration(all: All, period: string) {
  const department = new Map((all['mdm.employees'] ?? []).map((e) => [e.id, String(e.values.department)]))
  const reviews = (all['hrs.reviews'] ?? []).filter((r) => r.values.period === period)
  const groups = new Map<string, ErpRecord[]>()
  for (const r of reviews) groups.set(department.get(String(r.values.employee)) ?? 'Lainnya', [...(groups.get(department.get(String(r.values.employee)) ?? 'Lainnya') ?? []), r])
  const row = (name: string, list: readonly ErpRecord[]) => ({
    name,
    count: list.length,
    average: list.length ? Math.round((list.reduce((s, r) => s + Number(r.values.final), 0) / list.length) * 10) / 10 : 0,
    bands: BANDS.map((b) => list.filter((r) => r.values.band === b).length),
    final: list.filter((r) => r.status === 'approved').length,
  })
  return { rows: [...groups].map(([name, list]) => row(name, list)).sort((a, b) => b.average - a.average), total: row('Semua departemen', reviews) }
}
