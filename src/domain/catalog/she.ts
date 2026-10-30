/** Group SHE / K3 management (Safety, Health, Environment; Keselamatan dan Kesehatan Kerja) for the chemical and logistics sites. */
import type { RecordType } from '../records'
import { ACTIVE, date, flow, n, note, num, pick, ref, text, calc, master, type } from './kit'

export const INCIDENT_KINDS = ['Fatality', 'Lost time injury', 'Medical treatment', 'First aid', 'Near miss', 'Property damage', 'Environmental spill'] as const
export const PERMIT_KINDS = ['Hot work', 'Confined space', 'Work at height', 'Electrical LOTO', 'Excavation', 'Line breaking'] as const
const RISK = (l: number, s: number) => (l * s >= 15 ? 'Extreme' : l * s >= 9 ? 'High' : l * s >= 4 ? 'Medium' : 'Low')

export const SHE_MASTERS: readonly RecordType[] = [
  master('she', 'areas', ['Work areas', 'Work area', 'WA'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    ref('plant', 'Plant', 'mdm.plants', { required: true, parent: true, list: true }),
    pick('riskClass', 'Risk class', ['Low', 'Medium', 'High', 'Major hazard installation'], { required: true, list: true }),
    text('supervisor', 'Area owner', { required: true }),
    num('workers', 'Workers on site', 'people', { min: 0, list: true }),
  ], ACTIVE, { groupBy: 'riskClass' }),
  master('she', 'hiradc', ['HIRADC register', 'Hazard', 'HIR'], 'hazard', [
    ref('area', 'Work area', 'she.areas', { required: true, list: true }),
    text('activity', 'Activity', { required: true, list: true }),
    text('hazard', 'Hazard', { required: true }),
    num('likelihood', 'Likelihood', '1-5', { required: true, min: 1, max: 5 }),
    num('severity', 'Severity', '1-5', { required: true, min: 1, max: 5 }),
    calc('risk', 'Initial risk', (v) => RISK(n(v, 'likelihood'), n(v, 'severity')), { list: true }),
    pick('control', 'Main control', ['Elimination', 'Substitution', 'Engineering', 'Administrative', 'PPE'], { required: true, list: true }),
    num('residual', 'Residual likelihood', '1-5', { required: true, min: 1, max: 5 }),
    calc('residualRisk', 'Residual risk', (v) => RISK(n(v, 'residual'), n(v, 'severity')), { list: true }),
  ], ACTIVE, { groupBy: 'risk' }),
  master('she', 'ppe', ['PPE catalogue', 'PPE item', 'APD'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('kind', 'Type', ['Head', 'Eye and face', 'Respiratory', 'Hand', 'Body', 'Foot', 'Fall arrest'], { required: true, list: true }),
    text('standard', 'Standard', { required: true }),
    num('stock', 'In stock', 'pcs', { required: true, min: 0, list: true }),
    num('minimum', 'Minimum', 'pcs', { required: true, min: 0 }),
    calc('state', 'Stock state', (v) => (n(v, 'stock') <= n(v, 'minimum') ? 'Reorder' : 'OK'), { list: true }),
  ], ACTIVE, { sumField: 'stock', groupBy: 'kind' }),
  master('she', 'fireequipment', ['Fire equipment (APAR)', 'Fire equipment', 'FEX'], 'tag', [
    text('tag', 'Tag', { required: true, list: true }),
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    pick('kind', 'Type', ['APAR dry powder', 'APAR CO2', 'APAR foam', 'Hydrant', 'Fire monitor', 'Eye wash & shower'], { required: true, list: true }),
    num('capacity', 'Capacity', 'kg', { min: 0 }),
    date('nextService', 'Next service', { required: true, list: true }),
  ], ACTIVE, { groupBy: 'kind', dateField: 'nextService' }),
]

export const SHE: readonly RecordType[] = [
  type('she', 'permits', ['Permits to work', 'Permit to work', 'PTW'], 'job', [
    text('job', 'Job', { required: true, list: true }),
    pick('kind', 'Permit type', PERMIT_KINDS, { required: true, list: true }),
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    text('contractor', 'Performed by', { required: true }),
    date('start', 'Start', { required: true, list: true }),
    num('hours', 'Duration', 'h', { required: true, min: 1, max: 24 }),
    num('oxygen', 'Gas test O2', '%', { min: 0, max: 30 }),
    num('lel', 'Gas test LEL', '%', { min: 0, max: 100 }),
    calc('gasTest', 'Gas test', (v) => (n(v, 'lel') > 10 || (n(v, 'oxygen') > 0 && (n(v, 'oxygen') < 19.5 || n(v, 'oxygen') > 23.5)) ? 'Fail' : 'Pass'), { list: true }),
  ], flow([['requested', 'Requested', 'neutral'], ['approved', 'Approved', 'info'], ['active', 'Active', 'warning'], ['suspended', 'Suspended', 'danger'], ['closed', 'Closed', 'success'], ['rejected', 'Rejected', 'danger']], [
    ['requested', 'approved', 'Approve', 'approve'],
    ['requested', 'rejected', 'Reject', 'approve'],
    ['approved', 'active', 'Issue on site'],
    ['active', 'suspended', 'Suspend'],
    ['suspended', 'active', 'Resume', 'approve'],
    ['active', 'closed', 'Close out'],
  ]), { groupBy: 'kind', dateField: 'start' }, true),
  type('she', 'jsa', ['Job safety analyses', 'JSA step', 'JSA'], 'step', [
    ref('permit', 'Permit to work', 'she.permits', { required: true, list: true }),
    text('step', 'Job step', { required: true, list: true }),
    text('hazard', 'Hazard', { required: true, list: true }),
    text('control', 'Control', { required: true }),
  ], flow([['draft', 'Draft', 'neutral'], ['reviewed', 'Reviewed', 'success']], [['draft', 'reviewed', 'Review', 'approve']])),
  type('she', 'incidents', ['Incidents & accidents', 'Incident', 'SIR'], 'title', [
    text('title', 'What happened', { required: true, list: true }),
    pick('kind', 'Classification', INCIDENT_KINDS, { required: true, list: true }),
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    ref('person', 'Person involved', 'mdm.employees'),
    num('lostDays', 'Lost days', 'days', { min: 0 }),
    pick('cause', 'Root cause', ['Procedure not followed', 'Inadequate PPE', 'Equipment failure', 'Poor housekeeping', 'Chemical exposure', 'Fatigue', 'Third party'], { list: true }),
  ], flow([['reported', 'Reported', 'warning'], ['investigating', 'Investigating', 'info'], ['capa', 'CAPA in progress', 'info'], ['closed', 'Closed', 'success']], [
    ['reported', 'investigating', 'Start investigation'],
    ['investigating', 'capa', 'Agree CAPA'],
    ['capa', 'closed', 'Close', 'approve'],
  ]), { groupBy: 'kind', dateField: 'date' }, true),
  type('she', 'observations', ['Safety observations', 'Observation', 'OBS'], 'description', [
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    pick('kind', 'Type', ['Unsafe act', 'Unsafe condition', 'Safe behaviour'], { required: true, list: true }),
    pick('category', 'Category', ['PPE', 'Housekeeping', 'LOTO', 'Working at height', 'Chemical handling', 'Driving', 'Ergonomics'], { required: true, list: true }),
    text('description', 'What was seen', { required: true }),
    date('date', 'Date', { required: true, list: true }),
  ], flow([['open', 'Open', 'warning'], ['actioned', 'Actioned', 'info'], ['closed', 'Closed', 'success']], [
    ['open', 'actioned', 'Take action'],
    ['actioned', 'closed', 'Close'],
  ]), { groupBy: 'category', dateField: 'date' }, true),
  type('she', 'inspections', ['Safety inspections', 'Inspection', 'INS'], 'checklist', [
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    pick('checklist', 'Checklist', ['Monthly SHE walk', 'APAR monthly', 'Scaffold tag', 'Eye wash & shower', 'Chemical storage', 'Bund integrity'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('score', 'Score', '%', { required: true, min: 0, max: 100, list: true }),
    num('findings', 'Findings', 'items', { min: 0 }),
  ], flow([['scheduled', 'Scheduled', 'neutral'], ['done', 'Done', 'info'], ['verified', 'Verified', 'success']], [
    ['scheduled', 'done', 'Record result'],
    ['done', 'verified', 'Verify', 'approve'],
  ]), { groupBy: 'checklist', dateField: 'date' }),
  type('she', 'capa', ['Corrective & preventive actions', 'CAPA', 'CAPA'], 'action', [
    text('action', 'Action', { required: true, list: true }),
    ref('incident', 'Incident', 'she.incidents', { parent: true }),
    pick('source', 'Source', ['Incident', 'Inspection', 'Audit', 'Observation', 'HIRADC review'], { required: true, list: true }),
    text('owner', 'Owner', { required: true, list: true }),
    date('due', 'Due', { required: true, list: true }),
  ], flow([['open', 'Open', 'neutral'], ['progress', 'In progress', 'info'], ['done', 'Done', 'warning'], ['verified', 'Verified effective', 'success']], [
    ['open', 'progress', 'Start'],
    ['progress', 'done', 'Mark done'],
    ['done', 'verified', 'Verify effective', 'approve'],
    ['done', 'progress', 'Not effective'],
  ]), { groupBy: 'source', dateField: 'due' }),
  type('she', 'toolbox', ['Toolbox meetings', 'Toolbox meeting', 'TBT'], 'topic', [
    ref('area', 'Work area', 'she.areas', { required: true, parent: true, list: true }),
    text('topic', 'Topic', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('attendees', 'Attendees', 'people', { required: true, min: 1, list: true }),
  ], flow([['planned', 'Planned', 'neutral'], ['held', 'Held', 'success']], [['planned', 'held', 'Record attendance']]), { sumField: 'attendees', dateField: 'date' }, true),
  type('she', 'ppeissues', ['PPE issuance', 'PPE issue', 'PPI'], 'item', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    ref('item', 'PPE item', 'she.ppe', { required: true, list: true }),
    num('qty', 'Quantity', 'pcs', { required: true, min: 1, list: true }),
    date('date', 'Issued on', { required: true, list: true }),
  ], flow([['issued', 'Issued', 'success'], ['returned', 'Returned', 'neutral']], [['issued', 'returned', 'Record return']]), { sumField: 'qty', dateField: 'date' }),
  type('she', 'mcu', ['Medical check-ups (MCU)', 'Medical check-up', 'MCU'], 'kind', [
    ref('employee', 'Employee', 'mdm.employees', { required: true, list: true }),
    pick('kind', 'Type', ['Pre-employment', 'Annual', 'Chemical exposure', 'Return to work'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    pick('result', 'Fitness', ['Fit', 'Fit with note', 'Temporarily unfit', 'Unfit'], { required: true, list: true }),
    date('nextDue', 'Next due'),
  ], flow([['scheduled', 'Scheduled', 'neutral'], ['done', 'Examined', 'info'], ['reviewed', 'Reviewed by doctor', 'success']], [
    ['scheduled', 'done', 'Record result'],
    ['done', 'reviewed', 'Sign off', 'approve'],
  ]), { groupBy: 'result', dateField: 'date' }),
  type('she', 'waste', ['B3 waste manifests', 'Waste manifest', 'B3W'], 'wasteCode', [
    pick('wasteCode', 'Waste code', ['B105d Used oil', 'A102d Lab chemicals', 'B107d Process sludge', 'A108d Contaminated packaging', 'B109d Spent catalyst'], { required: true, list: true }),
    ref('area', 'Work area', 'she.areas', { required: true, parent: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0.01, list: true }),
    ref('transporter', 'Licensed transporter', 'mdm.partners', { required: true }),
    date('date', 'Date', { required: true, list: true }),
  ], flow([['stored', 'In TPS storage', 'warning'], ['shipped', 'Shipped', 'info'], ['received', 'Received by processor', 'success']], [
    ['stored', 'shipped', 'Ship with manifest', 'approve'],
    ['shipped', 'received', 'Confirm receipt'],
  ]), { sumField: 'qty', groupBy: 'wasteCode', dateField: 'date' }),
  type('she', 'licences', ['K3 licences & certificates', 'K3 licence', 'LIC'], 'licence', [
    ref('employee', 'Holder', 'mdm.employees', { required: true, list: true }),
    pick('licence', 'Licence', ['Ahli K3 Umum', 'Ahli K3 Kimia', 'SIO Forklift', 'SIO Crane', 'Operator boiler', 'Petugas P3K', 'Fire warden class D'], { required: true, list: true }),
    text('number', 'Certificate no.', { required: true }),
    date('expiry', 'Expires', { required: true, list: true }),
    note('issuer', 'Issued by'),
  ], flow([['valid', 'Valid', 'success'], ['renewal', 'Renewal due', 'warning'], ['expired', 'Expired', 'danger']], [
    ['valid', 'renewal', 'Start renewal'],
    ['renewal', 'valid', 'Record renewal', 'approve'],
    ['valid', 'expired', 'Mark expired'],
    ['expired', 'renewal', 'Start renewal'],
  ]), { groupBy: 'licence', dateField: 'expiry' }),
]
