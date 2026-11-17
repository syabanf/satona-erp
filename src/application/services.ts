import { typeOf } from '@/domain/catalog'
import { approvalMoves, isRejection, moveBlocker, overridesFrom, type Matrix } from '@/domain/approval'
import { can, effectiveAccess, type Access, type Action, type ErpModule, type Role } from '@/domain/erp'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { effectsFor, type Effects } from '@/domain/effects'
import { journalProblem, type Posting } from '@/domain/ledger'
import { issueParts } from '@/domain/maintenance'
import { canFileOwn, employeeOf, isSupervisor, TEAM_TYPES, teamOf } from '@/domain/selfService'
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

  /** The employee the signed-in role stands for. */
  async function me(role: Role) {
    const employee = employeeOf(role, await records.list('mdm.employees'))
    if (!employee) throw new ForbiddenError(`${role.name} has no employee record`)
    return employee
  }

  /** Issuing a part reservation takes the parts from stock; short stock blocks the issue before anything is saved. */
  async function stockAfterIssue(issue: ErpRecord) {
    const part = await records.get('eam.parts', String(issue.values.part))
    const qty = Number(issue.values.qty) || 0
    const { blocker, onHand } = issueParts(Number(part.values.onHand) || 0, qty)
    if (blocker) throw new ForbiddenError(blocker)
    return { part, qty, onHand }
  }

  /** Writes a journal and its lines straight to the ledger as posted, for document steps, depreciation and the close. */
  async function post(posting: Posting, by: string): Promise<ErpRecord> {
    const journalType = typeOf('fin.journals')!
    const lineType = typeOf('fin.journallines')!
    const at = stamp()
    const base = { createdAt: at, updatedAt: at, history: [{ at, by, action: 'Diposting otomatis' }] }
    const journal = await records.save({ ...base, id: nextId(journalType, await records.list(journalType.key)), type: journalType.key, status: 'posted', values: checked(journalType, posting.journal) }, { action: 'Diposting otomatis', by })
    for (const line of posting.lines) {
      await records.save({ ...base, id: nextId(lineType, await records.list(lineType.key)), type: lineType.key, status: lineType.workflow.initial, values: checked(lineType, { ...line, journal: journal.id }) }, { action: 'Dibuat', by })
    }
    return journal
  }

  /** What a document step sets off; a blocker stops the step before anything is saved. */
  async function effectsOf(typeKey: string, record: ErpRecord, step: string): Promise<Effects> {
    const effects = effectsFor(typeKey, record, step, await records.all(), ports.clock.today())
    if (effects.blocker) throw new ForbiddenError(effects.blocker)
    return effects
  }

  /** Carries out the stock moves, record updates, new records and journals of a step that was saved. */
  async function applyEffects(effects: Effects, by: string) {
    const at = stamp()
    for (const p of effects.patches) {
      const current = await records.get(p.type, p.id)
      await records.save({ ...current, values: computeValues(typeOf(p.type)!, { ...current.values, ...p.values }), updatedAt: at, history: [...current.history, { at, by, action: p.action }] }, { action: p.action, by })
    }
    for (const m of effects.moves) {
      const current = await records.get(m.type, m.id)
      await records.save({ ...current, status: m.status, updatedAt: at, history: [...current.history, { at, by, action: m.action }] }, { action: m.action, by })
    }
    for (const c of effects.creates) {
      const type = typeOf(c.type)!
      await records.save({ id: nextId(type, await records.list(c.type)), type: c.type, status: type.workflow.initial, values: computeValues(type, c.values), createdAt: at, updatedAt: at, history: [{ at, by, action: 'Dibuat otomatis' }] }, { action: 'Dibuat otomatis', by })
    }
    for (const posting of effects.postings) await post(posting, by)
  }

  return {
    ...ports,
    records: {
      ...records,
      accessFor,
      /** Back office staff create through their module access; an employee files their own requests from the employee area. */
      async create(role: Role, typeKey: string, values: Values, own = false): Promise<ErpRecord> {
        const type = typeOf(typeKey)
        if (!type) throw new NotFoundError('record type', typeKey)
        const allowed = own ? canFileOwn(role, typeKey) : canCreate(type, await accessFor(role, type))
        if (!allowed) throw new ForbiddenError(`${role.name} cannot create ${type.name.toLowerCase()}`)
        // An own request always carries the signed-in employee, whatever the form sent.
        if (own) values = { ...values, employee: (await me(role)).id }
        // A part issue without a unit cost takes the part's own.
        const part = typeKey === 'eam.issues' && !values.unitCost && values.part ? await records.get('eam.parts', String(values.part)).catch(() => undefined) : undefined
        const clean = checked(type, part ? { ...values, unitCost: part.values.unitCost } : values)
        const at = stamp()
        const record: ErpRecord = {
          id: nextId(type, await records.list(typeKey)),
          type: typeKey,
          // An employee's own request goes straight to its approver; they have no back office screen to submit it from.
          status: own && type.workflow.transitions.some((t) => t.from === type.workflow.initial && t.to === 'submitted') ? 'submitted' : type.workflow.initial,
          values: clean,
          createdAt: at,
          updatedAt: at,
          history: [{ at, by: role.name, action: 'Dibuat' }],
        }
        const effects = await effectsOf(typeKey, record, 'created')
        const saved = await records.save(record, { action: 'Dibuat', by: role.name })
        await applyEffects(effects, role.name)
        return saved
      },
      /** An employee changes a row of their own from the employee area, such as clocking out. */
      async updateOwn(role: Role, typeKey: string, id: string, patch: Values): Promise<ErpRecord> {
        const type = typeOf(typeKey)
        const current = await records.get(typeKey, id)
        if (!type || !canFileOwn(role, typeKey) || current.values.employee !== (await me(role)).id) throw new ForbiddenError(`${role.name} cannot change this record`)
        const at = stamp()
        return records.save({ ...current, values: checked(type, { ...current.values, ...patch }), updatedAt: at, history: [...current.history, { at, by: role.name, action: 'Diubah' }] }, { action: 'Diubah', by: role.name })
      },
      /** A supervisor approves or rejects a leave, overtime or shift-swap request of their own team. */
      async decideTeam(role: Role, typeKey: string, id: string, to: 'approved' | 'rejected'): Promise<ErpRecord> {
        const current = await records.get(typeKey, id)
        const team = teamOf(await me(role), await records.list('mdm.employees'))
        const mine = current.values.employee === (await me(role)).id
        if (!isSupervisor(role) || !(TEAM_TYPES as readonly string[]).includes(typeKey) || current.status !== 'submitted' || mine || !team.some((e) => e.id === current.values.employee)) throw new ForbiddenError(`${role.name} cannot decide this request`)
        const at = stamp()
        const action = to === 'approved' ? 'Disetujui atasan' : 'Ditolak atasan'
        return records.save({ ...current, status: to, updatedAt: at, history: [...current.history, { at, by: role.name, action }] }, { action, by: role.name })
      },
      /** Posts a ready-made journal, such as a depreciation run or the year-end close; needs approval rights on journals. */
      async post(role: Role, posting: Posting): Promise<ErpRecord> {
        await guard(role, 'fin.journals', 'approve')
        return post(posting, role.name)
      },
      async update(role: Role, typeKey: string, id: string, values: Values): Promise<ErpRecord> {
        const { type } = await guard(role, typeKey, 'edit')
        const current = await records.get(typeKey, id)
        const at = stamp()
        const record = { ...current, values: checked(type, values), updatedAt: at, history: [...current.history, { at, by: role.name, action: 'Diubah' }] }
        return records.save(record, { action: 'Diubah', by: role.name })
      },
      /** Logs an event on a record without changing it, such as an approval reminder. */
      async note(role: Role, typeKey: string, id: string, action: string): Promise<ErpRecord> {
        await guard(role, typeKey, 'read')
        const current = await records.get(typeKey, id)
        const at = stamp()
        return records.save({ ...current, history: [...current.history, { at, by: role.name, action }] }, { action, by: role.name })
      },
      async remove(role: Role, typeKey: string, id: string): Promise<void> {
        await guard(role, typeKey, 'delete')
        return records.remove(typeKey, id, role.name)
      },
      async transition(role: Role, typeKey: string, id: string, to: string): Promise<ErpRecord> {
        const [{ type, access }, current, m] = await Promise.all([guard(role, typeKey, 'read'), records.get(typeKey, id), matrix()])
        const gate = type.workflow.transitions.find((t) => t.from === current.status && t.to === to)
        // A journal moves on only when it balances, uses posting accounts and sits in an open period.
        const blocker = moveBlocker(type, current, to) ?? (typeKey === 'fin.journals' && (to === 'submitted' || to === 'posted') ? journalProblem(current, await records.all()) : undefined)
        if (blocker) throw new ForbiddenError(blocker)
        const at = stamp()
        const effects = await effectsOf(typeKey, current, to)
        if (gate?.needs === 'approve') {
          const { chain, step, moves } = approvalMoves(type, current, access, role, m, ports.clock.today())
          if (!moves.some((t) => t.to === to)) throw new ForbiddenError(step ? `Level ${step.level} of ${chain.length} waits for ${step.role}` : `${role.name} cannot approve ${type.name.toLowerCase()}`)
          if (step && !isRejection(type, to)) {
            const approvals = [...(current.approvals ?? []), { level: step.level, role: step.role, by: role.name, at }]
            const done = approvals.length >= chain.length
            const action = done ? `${gate.label} (level ${step.level} of ${chain.length}, final)` : `Approved level ${step.level} of ${chain.length}`
            const record = { ...current, status: done ? to : current.status, approvals, updatedAt: at, history: [...current.history, { at, by: role.name, action }] }
            const signed = await records.save(record, { action, by: role.name })
            if (done) await applyEffects(effects, role.name)
            return signed
          }
        }
        const move = gate?.needs === 'approve' ? gate : allowedTransitions(type, current.status, access).find((t) => t.to === to)
        if (!move) throw new ForbiddenError(`${role.name} cannot move this ${type.singular.toLowerCase()} to ${to}`)
        const stock = typeKey === 'eam.issues' && to === 'issued' ? await stockAfterIssue(current) : undefined
        // A rejection or a return to the first state starts the approval round again.
        const record = { ...current, status: to, approvals: isRejection(type, to) || to === type.workflow.initial ? undefined : current.approvals, updatedAt: at, history: [...current.history, { at, by: role.name, action: move.label }] }
        const saved = await records.save(record, { action: move.label, by: role.name })
        if (stock) {
          const action = `Issued ${stock.qty} to ${String(current.values.workorder)} (${current.id})`
          await records.save({ ...stock.part, values: computeValues(typeOf('eam.parts')!, { ...stock.part.values, onHand: stock.onHand }), updatedAt: at, history: [...stock.part.history, { at, by: role.name, action }] }, { action, by: role.name })
        }
        await applyEffects(effects, role.name)
        return saved
      },
    },
  }
}

export type Services = ReturnType<typeof createServices>
