/** Small builders so each catalogue file reads like the spreadsheet row it comes from. */
import type { Field, RecordType, StateTone, Values, Workflow } from '../records'

type Opts = Omit<Partial<Field>, 'key' | 'label' | 'type'>

export const text = (key: string, label: string, o: Opts = {}): Field => ({ key, label, type: 'text', ...o })
export const note = (key: string, label: string, o: Opts = {}): Field => ({ key, label, type: 'textarea', ...o })
export const num = (key: string, label: string, unit?: string, o: Opts = {}): Field => ({ key, label, type: 'number', unit, ...o })
export const money = (key: string, label: string, o: Opts = {}): Field => ({ key, label, type: 'money', min: 0, ...o })
export const date = (key: string, label: string, o: Opts = {}): Field => ({ key, label, type: 'date', ...o })
export const pick = (key: string, label: string, options: readonly string[], o: Opts = {}): Field => ({ key, label, type: 'select', options, ...o })
export const ref = (key: string, label: string, to: string, o: Opts = {}): Field => ({ key, label, type: 'ref', ref: to, ...o })
export const entity = (key = 'entity', label = 'Entity', o: Opts = {}): Field => ({ key, label, type: 'entity', options: ['holding', 'rotama', 'rodame', 'roasi'], ...o })
export const calc = (key: string, label: string, compute: (v: Values) => string | number, o: Opts = {}): Field => ({ key, label, type: 'computed', compute, ...o })

export const n = (v: Values, k: string) => Number(v[k] ?? 0) || 0
export const round1 = (x: number) => Math.round(x * 10) / 10

type State = [id: string, label: string, tone: StateTone]
type Move = [from: string, to: string, label: string, needs?: 'full' | 'approve']

export function flow(states: readonly State[], moves: readonly Move[]): Workflow {
  return {
    initial: states[0]?.[0] ?? '',
    states: states.map(([id, label, tone]) => ({ id, label, tone })),
    transitions: moves.map(([from, to, label, needs = 'full']) => ({ from, to, label, needs })),
  }
}

export const ACTIVE = flow(
  [
    ['active', 'Active', 'success'],
    ['inactive', 'Inactive', 'neutral'],
  ],
  [
    ['active', 'inactive', 'Deactivate'],
    ['inactive', 'active', 'Reactivate'],
  ],
)

/** Draft, submit, then an approver approves or rejects; rejected work goes back to draft. */
export const APPROVAL = flow(
  [
    ['draft', 'Draft', 'neutral'],
    ['submitted', 'Submitted', 'info'],
    ['approved', 'Approved', 'success'],
    ['rejected', 'Rejected', 'danger'],
  ],
  [
    ['draft', 'submitted', 'Submit'],
    ['submitted', 'approved', 'Approve', 'approve'],
    ['submitted', 'rejected', 'Reject', 'approve'],
    ['rejected', 'draft', 'Reopen'],
  ],
)

export function type(
  module: string,
  key: string,
  names: [name: string, singular: string, prefix: string],
  titleField: string,
  fields: readonly Field[],
  workflow: Workflow,
  insight: RecordType['insight'] = {},
  portalCreate = false,
): RecordType {
  const [name, singular, prefix] = names
  return { key: `${module}.${key}`, module, area: 'transaction', name, singular, prefix, titleField, fields, workflow, insight, portalCreate }
}

/** Same as `type`, filed under the module's master data. */
export const master = (...args: Parameters<typeof type>): RecordType => ({ ...type(...args), area: 'master' })

export const B3_CLASSES = ['Non-B3', 'Class 2.3 Toxic gas', 'Class 4.1 Flammable solid', 'Class 8 Corrosive'] as const
export const PROVINCES = ['Jawa Timur', 'Jawa Tengah', 'Jawa Barat', 'Lampung', 'Sumatera Selatan', 'Sulawesi Selatan'] as const
