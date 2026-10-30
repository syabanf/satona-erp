import type { Access, AccessOverride, Role } from './erp'
import { stateOf, type ApprovalSign, type ErpRecord, type RecordType } from './records'

export interface ApprovalStep {
  level: number
  role: string
  sla: number
}

export interface Matrix {
  rules: readonly ErpRecord[]
  levels: readonly ErpRecord[]
  delegations: readonly ErpRecord[]
}

const amountOf = (type: RecordType, record: Pick<ErpRecord, 'values'>) => Number(type.insight.sumField ? record.values[type.insight.sumField] : 0) || 0

/**
 * The approver chain the matrix sets for a record: the active rule for its document type whose entity and amount band match,
 * preferring an entity-specific rule over "all". No rule means the single approval step of the workflow applies.
 */
export function approvalChain(type: RecordType, record: Pick<ErpRecord, 'values'>, { rules, levels }: Pick<Matrix, 'rules' | 'levels'>): ApprovalStep[] {
  const amount = amountOf(type, record)
  const entity = String(record.values.entity ?? '')
  const rule = rules
    .filter((r) => r.status === 'active' && r.values.docType === type.key)
    .filter((r) => r.values.entity === 'all' || r.values.entity === entity)
    .filter((r) => amount >= Number(r.values.min ?? 0) && (!Number(r.values.max) || amount <= Number(r.values.max)))
    .sort((a, b) => Number(b.values.entity !== 'all') - Number(a.values.entity !== 'all'))[0]
  if (!rule) return []
  return levels
    .filter((l) => l.status === 'active' && l.values.rule === rule.id)
    .map((l) => ({ level: Number(l.values.level), role: String(l.values.approver), sla: Number(l.values.sla ?? 24) }))
    .sort((a, b) => a.level - b.level)
}

/** The level waiting for a signature, or undefined once every level has signed. */
export const pendingStep = (chain: readonly ApprovalStep[], signed: readonly ApprovalSign[] = []) => chain[signed.length]

/** The role holds the level itself, an admin stands in, or an active delegation from the level's role covers today. */
export function maySign(step: ApprovalStep, role: Pick<Role, 'id' | 'name'>, delegations: readonly ErpRecord[], today: string): boolean {
  if (role.id === 'admin' || role.name === step.role) return true
  return delegations.some(
    (d) => d.status === 'active' && d.values.fromRole === step.role && d.values.toRole === role.name && String(d.values.from) <= today && today <= String(d.values.to),
  )
}

/** A move into a danger state (rejected, disputed) ends the chain; any other approve move signs the next level. */
export const isRejection = (type: RecordType, to: string) => stateOf(type, to)?.tone === 'danger'

/** Active permission overrides as plain rows, joining each to its role's name. */
export function overridesFrom(permissions: readonly ErpRecord[], roles: readonly ErpRecord[]): AccessOverride[] {
  return permissions
    .filter((p) => p.status === 'active')
    .flatMap((p) => {
      const role = roles.find((r) => r.id === p.values.role)
      return role ? [{ role: String(role.values.name), module: String(p.values.module), access: p.values.access as Access }] : []
    })
}

export const matrixOf = (all: Readonly<Record<string, readonly ErpRecord[]>>): Matrix => ({ rules: all['sys.matrix'] ?? [], levels: all['sys.levels'] ?? [], delegations: all['sys.delegations'] ?? [] })

/**
 * The approve and reject moves a role may take on a record now. With a matrix chain the holder of the pending level
 * (or their delegate) decides, whatever their module access; without one the module approvers do.
 */
export function approvalMoves(type: RecordType, record: ErpRecord, access: Access, role: Pick<Role, 'id' | 'name'>, matrix: Matrix, today: string) {
  const gates = type.workflow.transitions.filter((t) => t.from === record.status && t.needs === 'approve')
  const chain = gates.length ? approvalChain(type, record, matrix) : []
  const step = pendingStep(chain, record.approvals)
  const allowed = step ? maySign(step, role, matrix.delegations, today) : access === 'approve'
  return { chain, step, moves: allowed ? gates : [] }
}

/** Every record waiting for this role's decision, matrix levels included. */
export function approvalInbox(types: readonly RecordType[], all: Readonly<Record<string, readonly ErpRecord[]>>, accessFor: (module: string) => Access, role: Pick<Role, 'id' | 'name'>, today: string) {
  const matrix = matrixOf(all)
  return types.flatMap((type) =>
    (all[type.key] ?? []).flatMap((record) => {
      const { moves, step, chain } = approvalMoves(type, record, accessFor(type.module), role, matrix, today)
      return moves.length ? [{ type, record, moves, step, levels: chain.length }] : []
    }),
  )
}

/** Keep operational follow-up actions separate from decisions that need approval. */
export function isPendingApproval(item: ReturnType<typeof approvalInbox>[number]): boolean {
  return item.record.status !== 'closed' && item.moves.some((move) => /^(approve|reject|release|sign(?: off)?|post|accept|authori[sz]e|confirm|review|verify|validate|clear)\b/i.test(move.label))
}

/** A safety rule that stops a move whatever the approver says, such as a permit with a failed gas test. */
export function moveBlocker(type: RecordType, record: Pick<ErpRecord, 'values'>, to: string): string | undefined {
  if (type.key === 'she.permits' && (to === 'approved' || to === 'active') && record.values.gasTest === 'Fail') return `Gas test failed (LEL ${String(record.values.lel)}%). Ventilate and re-test before approving.`
  if (type.key === 'wms.tasks' && to === 'done' && record.values.segregation !== 'Compatible') return `${String(record.values.materialClass)} cannot be stored in a ${String(record.values.zoneClass)} zone. Pick a bin in a compatible zone.`
  return undefined
}
