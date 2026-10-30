import { typeOf } from '@/domain/catalog'
import { approvalMoves, isRejection, moveBlocker, overridesFrom, type Matrix } from '@/domain/approval'
import { can, effectiveAccess, type Access, type Action, type ErpModule, type Role } from '@/domain/erp'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { allowedTransitions, canCreate, computeValues, nextId, validate, type ErpRecord, type RecordType, type Values } from '@/domain/records'
import type { Ports } from './ports'

const VERB: Record<Action, string> = { read: 'open', step: 'move', create: 'create', edit: 'change', delete: 'delete', approve: 'approve' }

/** The use cases the pages call. Record writes check the session role's access, validate, then store. */
export function createServices(ports: Ports) {
  const { records } = ports
  let modules: Promise<readonly ErpModule[]> | undefined
  const moduleList = () => (modules ??= ports.erp.modules())

  async function accessFor(role: Role, type: RecordType): Promise<Access> {
    const m = (await moduleList()).find((x) => x.id === type.module)
    if (!m) return 'none'
    const [permissions, roles] = await Promise.all([records.list('sys.permissions'), records.list('sys.roles')])
    return effectiveAccess(role, m, overridesFrom(permissions, roles))
  }

  async function matrix(): Promise<Matrix> {
    const [rules, levels, delegations] = await Promise.all([records.list('sys.matrix'), records.list('sys.levels'), records.list('sys.delegations')])
    return { rules, levels, delegations }
  }

  async function guard(role: Role, typeKey: string, action: Action) {
    const type = typeOf(typeKey)
    if (!type) throw new NotFoundError('record type', typeKey)
    const access = await accessFor(role, type)
    if (!can(access, action)) throw new ForbiddenError(`${role.name} cannot ${VERB[action]} ${type.name.toLowerCase()}`)
    return { type, access }
  }

  function checked(type: RecordType, values: Values) {
    const errors = validate(type, values)
    if (Object.keys(errors).length) throw new ValidationError(errors)
    return computeValues(type, values)
  }

  const stamp = () => new Date().toISOString()

  return {
    ...ports,
    records: {
      ...records,
      accessFor,
      async create(role: Role, typeKey: string, values: Values): Promise<ErpRecord> {
        const { type, access } = await guard(role, typeKey, 'read')
        if (!canCreate(type, access)) throw new ForbiddenError(`${role.name} cannot create ${type.name.toLowerCase()}`)
        const clean = checked(type, values)
        const at = stamp()
        const record: ErpRecord = {
          id: nextId(type, await records.list(typeKey)),
          type: typeKey,
          status: type.workflow.initial,
          values: clean,
          createdAt: at,
          updatedAt: at,
          history: [{ at, by: role.name, action: 'Created' }],
        }
        return records.save(record, { action: 'Created', by: role.name })
      },
      async update(role: Role, typeKey: string, id: string, values: Values): Promise<ErpRecord> {
        const { type } = await guard(role, typeKey, 'edit')
        const current = await records.get(typeKey, id)
        const at = stamp()
        const record = { ...current, values: checked(type, values), updatedAt: at, history: [...current.history, { at, by: role.name, action: 'Edited' }] }
        return records.save(record, { action: 'Updated', by: role.name })
      },
      async remove(role: Role, typeKey: string, id: string): Promise<void> {
        await guard(role, typeKey, 'delete')
        return records.remove(typeKey, id, role.name)
      },
      async transition(role: Role, typeKey: string, id: string, to: string): Promise<ErpRecord> {
        const [{ type, access }, current, m] = await Promise.all([guard(role, typeKey, 'read'), records.get(typeKey, id), matrix()])
        const gate = type.workflow.transitions.find((t) => t.from === current.status && t.to === to)
        const blocker = moveBlocker(type, current, to)
        if (blocker) throw new ForbiddenError(blocker)
        const at = stamp()
        if (gate?.needs === 'approve') {
          const { chain, step, moves } = approvalMoves(type, current, access, role, m, ports.clock.today())
          if (!moves.some((t) => t.to === to)) throw new ForbiddenError(step ? `Level ${step.level} of ${chain.length} waits for ${step.role}` : `${role.name} cannot approve ${type.name.toLowerCase()}`)
          if (step && !isRejection(type, to)) {
            const approvals = [...(current.approvals ?? []), { level: step.level, role: step.role, by: role.name, at }]
            const done = approvals.length >= chain.length
            const action = done ? `${gate.label} (level ${step.level} of ${chain.length}, final)` : `Approved level ${step.level} of ${chain.length}`
            const record = { ...current, status: done ? to : current.status, approvals, updatedAt: at, history: [...current.history, { at, by: role.name, action }] }
            return records.save(record, { action, by: role.name })
          }
        }
        const move = gate?.needs === 'approve' ? gate : allowedTransitions(type, current.status, access).find((t) => t.to === to)
        if (!move) throw new ForbiddenError(`${role.name} cannot move this ${type.singular.toLowerCase()} to ${to}`)
        // A rejection or a return to the first state starts the approval round again.
        const record = { ...current, status: to, approvals: isRejection(type, to) || to === type.workflow.initial ? undefined : current.approvals, updatedAt: at, history: [...current.history, { at, by: role.name, action: move.label }] }
        return records.save(record, { action: move.label, by: role.name })
      },
    },
  }
}

export type Services = ReturnType<typeof createServices>
