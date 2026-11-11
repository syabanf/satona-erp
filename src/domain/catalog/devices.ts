/** Device management for the group's IoT and OT estate: models, devices, firmware, OTA rollouts, remote commands and alerts. */
import type { RecordType } from '../records'
import { APPROVAL, calc, date, entity, flow, n, note, num, pick, ref, text, master, type } from './kit'

export const DEVICE_KINDS = ['PLC', 'Edge gateway', 'Sensor', 'HMI panel', 'Barcode scanner', 'Tablet', 'IP camera'] as const
export const DEVICE_COMMANDS = ['Ping', 'Reboot', 'Sync configuration', 'Rotate certificate', 'Factory reset'] as const

export const DEVICE_TYPES: readonly RecordType[] = [
  master('dvm', 'models', ['Device models', 'Device model', 'DMD'], 'name', [
    text('name', 'Model', { required: true, list: true }),
    text('vendor', 'Vendor', { required: true, list: true }),
    pick('kind', 'Kind', DEVICE_KINDS, { required: true, list: true }),
    pick('protocol', 'Protocol', ['Modbus TCP', 'OPC UA', 'MQTT', 'LoRaWAN', 'HTTPS'], { required: true, list: true }),
    text('latestFirmware', 'Latest firmware', { list: true }),
  ], flow(
    [
      ['supported', 'Supported', 'success'],
      ['endoflife', 'End of life', 'neutral'],
    ],
    [
      ['supported', 'endoflife', 'Mark end of life'],
      ['endoflife', 'supported', 'Support again'],
    ],
  ), { groupBy: 'kind' }),
  master('dvm', 'devices', ['Devices', 'Device', 'IOT'], 'name', [
    text('name', 'Device', { required: true, list: true }),
    ref('model', 'Model', 'dvm.models', { required: true, list: true }),
    entity('entity', 'Company', { required: true, list: true }),
    text('site', 'Site', { required: true, list: true }),
    ref('asset', 'Machine', 'eam.assets'),
    text('serial', 'Serial no.', { required: true }),
    text('ip', 'IP address'),
    text('firmware', 'Firmware', { list: true }),
    date('lastSeen', 'Last heartbeat', { list: true }),
    num('battery', 'Battery', '%', { min: 0, max: 100 }),
    date('certExpiry', 'Certificate expires'),
  ], flow(
    [
      ['provisioned', 'Provisioned', 'info'],
      ['online', 'Online', 'success'],
      ['offline', 'Offline', 'danger'],
      ['maintenance', 'Maintenance', 'warning'],
      ['retired', 'Retired', 'neutral'],
    ],
    [
      ['provisioned', 'online', 'Activate'],
      ['online', 'offline', 'Mark offline'],
      ['offline', 'online', 'Back online'],
      ['online', 'maintenance', 'Start maintenance'],
      ['maintenance', 'online', 'Return to service'],
      ['offline', 'retired', 'Retire', 'approve'],
      ['maintenance', 'retired', 'Retire', 'approve'],
    ],
  ), { groupBy: 'entity', dateField: 'lastSeen' }),
  master('dvm', 'firmware', ['Firmware releases', 'Firmware release', 'FW'], 'version', [
    ref('model', 'Model', 'dvm.models', { required: true, list: true, parent: true }),
    text('version', 'Version', { required: true, list: true }),
    date('released', 'Released', { required: true, list: true }),
    pick('severity', 'Update type', ['Security', 'Bug fix', 'Feature'], { required: true, list: true }),
    note('notes', 'Release notes'),
  ], APPROVAL, { groupBy: 'severity', dateField: 'released' }),
  type('dvm', 'rollouts', ['Firmware rollouts (OTA)', 'Rollout', 'OTA'], 'title', [
    text('title', 'Rollout', { required: true, list: true }),
    ref('firmware', 'Firmware', 'dvm.firmware', { required: true, list: true }),
    num('targets', 'Target devices', undefined, { required: true, min: 1 }),
    num('updated', 'Updated', undefined, { min: 0 }),
    num('failed', 'Failed', undefined, { min: 0 }),
    calc('progress', 'Progress', (v) => (n(v, 'targets') ? Math.round((n(v, 'updated') / n(v, 'targets')) * 100) : 0), { unit: '%', list: true }),
    date('window', 'Maintenance window', { required: true, list: true }),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['running', 'Running', 'info'],
      ['completed', 'Completed', 'success'],
      ['rolledback', 'Rolled back', 'danger'],
    ],
    [
      ['planned', 'running', 'Start rollout', 'approve'],
      ['running', 'completed', 'Complete'],
      ['running', 'rolledback', 'Roll back'],
    ],
  ), { sumField: 'targets', dateField: 'window' }),
  type('dvm', 'commands', ['Remote commands', 'Remote command', 'CMD'], 'command', [
    ref('device', 'Device', 'dvm.devices', { required: true, list: true, parent: true }),
    pick('command', 'Command', DEVICE_COMMANDS, { required: true, list: true }),
    date('requested', 'Requested', { required: true, list: true }),
    text('result', 'Result', { list: true }),
  ], flow(
    [
      ['queued', 'Queued', 'neutral'],
      ['sent', 'Sent', 'info'],
      ['done', 'Done', 'success'],
      ['failed', 'Failed', 'danger'],
    ],
    [
      ['queued', 'sent', 'Send'],
      ['sent', 'done', 'Mark done'],
      ['sent', 'failed', 'Mark failed'],
      ['failed', 'queued', 'Retry'],
    ],
  ), { groupBy: 'command', dateField: 'requested' }),
  type('dvm', 'alerts', ['Device alerts', 'Device alert', 'DAL'], 'kind', [
    ref('device', 'Device', 'dvm.devices', { required: true, list: true, parent: true }),
    pick('kind', 'Alert', ['Offline', 'Battery low', 'Certificate expiring', 'High temperature', 'Firmware outdated'], { required: true, list: true }),
    pick('severity', 'Severity', ['Low', 'Medium', 'High'], { required: true, list: true }),
    date('raised', 'Raised', { required: true, list: true }),
  ], flow(
    [
      ['open', 'Open', 'danger'],
      ['acknowledged', 'Acknowledged', 'warning'],
      ['resolved', 'Resolved', 'success'],
    ],
    [
      ['open', 'acknowledged', 'Acknowledge'],
      ['acknowledged', 'resolved', 'Resolve'],
      ['open', 'resolved', 'Resolve'],
    ],
  ), { groupBy: 'kind', dateField: 'raised' }),
]
