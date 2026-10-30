/** PT Roasi Sinergi Industri (chemicals): CFP, EHS, TFM, GTR. */
import type { RecordType } from '../records'
import { ACTIVE, calc, date, flow, n, note, num, pick, ref, round1, text, master, type } from './kit'

export const ROASI: readonly RecordType[] = [
  type('cfp', 'logs', ['Reactor logs', 'Reactor log', 'RLG'], 'reactor', [
    pick('reactor', 'Reactor', ['R-101 Sulfuric', 'R-102 Phosphoric', 'R-103 Oleum'], { required: true, list: true }),
    pick('shift', 'Shift', ['A', 'B', 'C'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('feed', 'Feed', 't', { required: true, min: 1 }),
    num('output', 'Output', 't', { required: true, min: 0, list: true }),
    num('byproduct', 'By-product', 't', { min: 0 }),
    calc('yield', 'Yield', (v) => (n(v, 'feed') ? round1((n(v, 'output') / n(v, 'feed')) * 100) : 0), { unit: '%', list: true }),
  ], flow(
    [
      ['logged', 'Logged', 'info'],
      ['verified', 'Verified', 'success'],
    ],
    [['logged', 'verified', 'Verify', 'approve']],
  ), { sumField: 'output', groupBy: 'reactor', dateField: 'date' }),
  type('cfp', 'waste', ['Waste records', 'Waste record', 'WST'], 'wasteType', [
    pick('wasteType', 'Waste', ['Gypsum', 'Spent catalyst', 'Acidic wastewater', 'Sludge'], { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0, list: true }),
    pick('method', 'Disposal', ['Licensed B3 transporter', 'On-site treatment', 'Co-processing'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
  ], flow(
    [
      ['stored', 'Stored', 'warning'],
      ['manifested', 'Manifested', 'info'],
      ['disposed', 'Disposed', 'success'],
    ],
    [
      ['stored', 'manifested', 'Create manifest'],
      ['manifested', 'disposed', 'Confirm disposal', 'approve'],
    ],
  ), { sumField: 'qty', groupBy: 'wasteType', dateField: 'date' }),

  type('ehs', 'sds', ['Safety data sheets', 'SDS', 'SDS'], 'chemical', [
    text('chemical', 'Chemical', { required: true, list: true }),
    text('cas', 'CAS number', { required: true, list: true }),
    pick('ghs', 'GHS hazard', ['Corrosive', 'Acute toxic', 'Oxidizer', 'Flammable', 'Health hazard'], { required: true, list: true }),
    date('revision', 'Revision date', { required: true, list: true }),
    num('version', 'SDS version', undefined, { min: 1 }),
    pick('language', 'Language', ['Bahasa Indonesia', 'English', 'Both']),
    pick('signalWord', 'Signal word', ['Danger', 'Warning']),
    text('pictograms', 'GHS pictograms'),
    num('sections', 'Sections complete', 'of 16', { min: 0, max: 16 }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['reviewed', 'Reviewed', 'info'],
      ['published', 'Published', 'success'],
    ],
    [
      ['draft', 'reviewed', 'Mark reviewed'],
      ['reviewed', 'published', 'Publish', 'approve'],
      ['published', 'draft', 'New revision'],
    ],
  ), { groupBy: 'ghs' }),
  type('ehs', 'emissions', ['Emission readings', 'Reading', 'EMS'], 'stack', [
    ref('stack', 'Emission point', 'ehs.points', { required: true, list: true }),
    pick('parameter', 'Parameter', ['SO₂', 'NOx', 'PM', 'COD', 'pH'], { required: true, list: true }),
    num('value', 'Value', undefined, { required: true, min: 0, list: true }),
    num('limit', 'Permit limit', undefined, { required: true, min: 0 }),
    calc('ratio', 'Of limit', (v) => (n(v, 'limit') ? round1((n(v, 'value') / n(v, 'limit')) * 100) : 0), { unit: '%', list: true }),
    date('date', 'Date', { required: true }),
  ], flow(
    [
      ['recorded', 'Recorded', 'info'],
      ['reviewed', 'Reviewed', 'success'],
    ],
    [['recorded', 'reviewed', 'Review', 'approve']],
  ), { groupBy: 'parameter', dateField: 'date' }),
  type('ehs', 'incidents', ['Incidents', 'Incident', 'INC'], 'title', [
    text('title', 'What happened', { required: true, list: true }),
    pick('kind', 'Type', ['Near miss', 'First aid', 'Lost time injury', 'Spill', 'Fire'], { required: true, list: true }),
    text('area', 'Area', { required: true }),
    pick('severity', 'Severity', ['Low', 'Medium', 'High'], { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
  ], flow(
    [
      ['reported', 'Reported', 'warning'],
      ['investigating', 'Investigating', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['reported', 'investigating', 'Start investigation'],
      ['investigating', 'closed', 'Close', 'approve'],
    ],
  ), { groupBy: 'kind', dateField: 'date' }),

  master('tfm', 'tanks', ['Tanks', 'Tank', 'TNK'], 'tank', [
    text('tank', 'Tank', { required: true, list: true }),
    text('product', 'Product', { required: true, list: true }),
    num('capacity', 'Capacity', 'm³', { required: true, min: 1 }),
    num('level', 'Level', '%', { required: true, min: 0, max: 100, list: true }),
    num('reorderAt', 'Reorder point', '%', { required: true, min: 0, max: 100, list: true }),
    calc('reorder', 'Needs reorder', (v) => (n(v, 'level') <= n(v, 'reorderAt') ? 'Yes' : 'No'), { list: true }),
    text('supplier', 'Supplier'),
  ], flow(
    [
      ['online', 'Online', 'success'],
      ['offline', 'Offline', 'neutral'],
    ],
    [
      ['online', 'offline', 'Take offline'],
      ['offline', 'online', 'Bring online'],
    ],
  ), { groupBy: 'reorder' }),
  type('tfm', 'recons', ['Stock reconciliations', 'Reconciliation', 'REC'], 'tank', [
    ref('tank', 'Tank', 'tfm.tanks', { required: true, list: true }),
    num('book', 'Book stock', 'm³', { required: true, min: 0, list: true }),
    num('measured', 'Dip reading', 'm³', { required: true, min: 0, list: true }),
    calc('variance', 'Variance', (v) => (n(v, 'book') ? round1(((n(v, 'measured') - n(v, 'book')) / n(v, 'book')) * 100) : 0), { unit: '%', list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['posted', 'Posted', 'success'],
    ],
    [['draft', 'posted', 'Post adjustment', 'approve']],
  )),

  type('gtr', 'lots', ['Product lots', 'Lot', 'GLT'], 'lotNo', [
    text('lotNo', 'Lot', { required: true, list: true }),
    text('product', 'Product', { required: true, list: true }),
    date('produced', 'Produced', { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 0, list: true }),
  ], flow(
    [
      ['released', 'Released', 'success'],
      ['hold', 'On hold', 'warning'],
      ['recalled', 'Recalled', 'danger'],
    ],
    [
      ['released', 'hold', 'Put on hold'],
      ['hold', 'released', 'Release', 'approve'],
      ['hold', 'recalled', 'Recall', 'approve'],
      ['released', 'recalled', 'Recall', 'approve'],
    ],
  ), { groupBy: 'product', dateField: 'produced' }),
  type('gtr', 'recalls', ['Recalls', 'Recall', 'RCL'], 'reason', [
    ref('lot', 'Lot', 'gtr.lots', { required: true, list: true }),
    note('reason', 'Reason', { required: true, list: true }),
    num('customers', 'Customers affected', undefined, { required: true, min: 0, list: true }),
    pick('kind', 'Kind', ['Real recall', 'Mock recall'], { list: true }),
    num('shipped', 'Quantity shipped', 't', { min: 0 }),
    num('recovered', 'Quantity recovered', 't', { min: 0 }),
    calc('recovery', 'Recovered', (v) => (n(v, 'shipped') ? round1((n(v, 'recovered') / n(v, 'shipped')) * 100) : 0), { unit: '%', list: true }),
  ], flow(
    [
      ['opened', 'Opened', 'danger'],
      ['notified', 'Customers notified', 'warning'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['opened', 'notified', 'Notify customers'],
      ['notified', 'closed', 'Close recall', 'approve'],
    ],
  )),
]

export const ROASI_MASTERS: readonly RecordType[] = [
  master('cfp', 'units', ['Process units', 'Process unit', 'PU'], 'name', [
    text('name', 'Unit', { required: true, list: true }),
    pick('kind', 'Kind', ['Reactor', 'Absorber', 'Converter', 'Evaporator', 'Scrubber'], { required: true, list: true }),
    num('design', 'Design rate', 't/day', { required: true, min: 1, list: true }),
    text('tag', 'P&ID tag'),
  ], ACTIVE, { groupBy: 'kind' }),
  master('ehs', 'points', ['Emission points', 'Emission point', 'EP'], 'name', [
    text('name', 'Point', { required: true, list: true }),
    pick('medium', 'Medium', ['Air (stack)', 'Wastewater'], { required: true, list: true }),
    text('permit', 'Permit reference', { list: true }),
    num('height', 'Stack height', 'm', { min: 0 }),
  ], ACTIVE),
  master('ehs', 'hazards', ['Chemical hazard matrix', 'Hazard entry', 'HZ'], 'chemical', [
    text('area', 'Work area', { required: true, list: true }),
    ref('chemical', 'Chemical', 'ehs.sds', { required: true, list: true }),
    pick('exposure', 'Exposure', ['Low', 'Medium', 'High'], { required: true, list: true }),
    text('ppe', 'Required PPE', { required: true }),
  ], ACTIVE, { groupBy: 'exposure' }),
  master('tfm', 'gauges', ['IoT gauges', 'Gauge', 'GAU'], 'sensor', [
    text('sensor', 'Sensor id', { required: true, list: true }),
    ref('tank', 'Tank', 'tfm.tanks', { required: true, list: true }),
    pick('kind', 'Kind', ['Radar level', 'Dip level', 'Temperature', 'Pressure'], { required: true, list: true }),
    date('calibrated', 'Last calibration', { list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('gtr', 'specs', ['Product specifications', 'Specification', 'SPC'], 'product', [
    text('product', 'Product', { required: true, list: true }),
    text('parameter', 'Parameter', { required: true, list: true }),
    num('min', 'Min', undefined, { list: true }),
    num('max', 'Max', undefined, { list: true }),
    text('unit', 'Unit'),
  ], ACTIVE, { groupBy: 'product' }),
]
