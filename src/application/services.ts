import { typeOf } from '@/domain/catalog'
import { accessOf, can, type Access, type Action, type ErpModule, type Role } from '@/domain/erp'
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
    return m ? accessOf(role, m) : 'none'
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
        const { type, access } = await guard(role, typeKey, 'read')
        const current = await records.get(typeKey, id)
        const move = allowedTransitions(type, current.status, access).find((t) => t.to === to)
        if (!move) throw new ForbiddenError(`${role.name} cannot move this ${type.singular.toLowerCase()} to ${to}`)
        const at = stamp()
        const record = { ...current, status: to, updatedAt: at, history: [...current.history, { at, by: role.name, action: move.label }] }
        return records.save(record, { action: move.label, by: role.name })
      },
    },
  }
}

export type Services = ReturnType<typeof createServices>
