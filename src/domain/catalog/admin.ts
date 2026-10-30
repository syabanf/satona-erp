/** System administration: roles and permissions, the multilevel approval matrix, delegations and general settings. */
import type { RecordType } from '../records'
import { ACTIVE, date, flow, money, note, num, pick, ref, text, master, type } from './kit'

export const ACCESS_LEVELS = ['approve', 'full', 'portal', 'view', 'none'] as const

/** Built with the list of record types that have an approval gate, so the matrix can only name real documents. */
export function adminTypes(approvable: readonly string[]): readonly RecordType[] {
  return [
    master('sys', 'roles', ['Roles', 'Role', 'ROL'], 'name', [
      text('name', 'Role name', { required: true, list: true }),
      text('module', 'Home module', { required: true, list: true }),
      text('department', 'Department'),
      num('seats', 'Seats', 'users', { required: true, min: 1, list: true }),
      pick('kind', 'Kind', ['Internal', 'Portal'], { required: true, list: true }),
    ], ACTIVE, { groupBy: 'kind' }),
    master('sys', 'permissions', ['Permission overrides', 'Permission', 'PMS'], 'module', [
      ref('role', 'Role', 'sys.roles', { required: true, parent: true, list: true }),
      text('module', 'Module code', { required: true, list: true }),
      pick('access', 'Access', ACCESS_LEVELS, { required: true, list: true }),
      text('reason', 'Reason'),
    ], ACTIVE, { groupBy: 'access' }),
    master('sys', 'matrix', ['Approval matrix', 'Approval rule', 'AM'], 'name', [
      text('name', 'Rule', { required: true, list: true }),
      pick('docType', 'Document', approvable, { required: true, list: true }),
      pick('entity', 'Entity', ['all', 'holding', 'rotama', 'rodame', 'roasi'], { required: true, list: true }),
      money('min', 'From amount', { required: true }),
      money('max', 'Up to amount (0 = no limit)'),
    ], ACTIVE, { groupBy: 'docType' }),
    master('sys', 'levels', ['Approval levels', 'Approval level', 'AML'], 'approver', [
      ref('rule', 'Approval rule', 'sys.matrix', { required: true, parent: true, list: true }),
      num('level', 'Level', '', { required: true, min: 1, max: 5, list: true }),
      text('approver', 'Approver role', { required: true, list: true }),
      num('sla', 'SLA', 'h', { required: true, min: 1, list: true }),
    ], ACTIVE, { sumField: 'sla' }),
    type('sys', 'delegations', ['Approval delegations', 'Delegation', 'DLG'], 'reason', [
      text('fromRole', 'Delegated by', { required: true, list: true }),
      text('toRole', 'Delegated to', { required: true, list: true }),
      date('from', 'From', { required: true, list: true }),
      date('to', 'Until', { required: true, list: true }),
      text('reason', 'Reason', { required: true }),
    ], flow([['active', 'Active', 'success'], ['revoked', 'Revoked', 'neutral']], [['active', 'revoked', 'Revoke']]), { dateField: 'from' }),
    master('sys', 'numbering', ['Number ranges', 'Number range', 'NR'], 'docType', [
      text('docType', 'Document', { required: true, list: true }),
      text('pattern', 'Pattern', { required: true, list: true }),
      num('next', 'Next number', '', { required: true, min: 1, list: true }),
      pick('reset', 'Reset', ['Never', 'Yearly', 'Monthly'], { required: true, list: true }),
    ], ACTIVE),
    master('sys', 'settings', ['General settings', 'Setting', 'SET'], 'name', [
      text('name', 'Setting', { required: true, list: true }),
      pick('group', 'Group', ['Company', 'Locale', 'Security', 'Notifications', 'Integration'], { required: true, list: true }),
      text('value', 'Value', { required: true, list: true }),
      note('note', 'Note'),
    ], ACTIVE, { groupBy: 'group' }),
    master('sys', 'holidays', ['Holiday calendar', 'Holiday', 'HOL'], 'name', [
      text('name', 'Name', { required: true, list: true }),
      date('date', 'Date', { required: true, list: true }),
      pick('kind', 'Kind', ['National holiday', 'Collective leave', 'Plant shutdown'], { required: true, list: true }),
    ], ACTIVE, { groupBy: 'kind', dateField: 'date' }),
    master('sys', 'templates', ['Notification templates', 'Notification template', 'NTF'], 'event', [
      text('event', 'Event', { required: true, list: true }),
      pick('channel', 'Channel', ['Email', 'WhatsApp', 'In-app'], { required: true, list: true }),
      text('recipients', 'Recipients', { required: true, list: true }),
      note('body', 'Message', { required: true }),
    ], ACTIVE, { groupBy: 'channel' }),
  ]
}

/** General master data shared by every module. */
export const GENERAL_MASTERS: readonly RecordType[] = [
  master('mdm', 'currencies', ['Currencies', 'Currency', 'CUR'], 'code', [
    text('code', 'ISO code', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    num('decimals', 'Decimals', '', { required: true, min: 0, max: 4 }),
  ], ACTIVE),
  master('mdm', 'taxcodes', ['Tax codes', 'Tax code', 'TXC'], 'code', [
    text('code', 'Code', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    num('rate', 'Rate', '%', { required: true, min: 0, max: 100, list: true }),
  ], ACTIVE),
]
