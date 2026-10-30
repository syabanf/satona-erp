/** PT Rodame Indonesia (fertiliser): BPF, MRP, QC, EAM, DMS. */
import type { RecordType } from '../records'
import { ACTIVE, APPROVAL, PROVINCES, calc, date, flow, money, n, note, num, pick, ref, round1, text, master, type } from './kit'

const LINES = ['Line A Gresik', 'Line B Gresik', 'Urea Palembang'] as const
const PRODUCTS = ['Urea', 'NPK 15-15-15', 'NPK 16-16-16', 'ZA'] as const

export const RODAME: readonly RecordType[] = [
  master('bpf', 'formulas', ['Formulas', 'Formula', 'FRM'], 'grade', [
    text('grade', 'Grade', { required: true, list: true }),
    num('n', 'Nitrogen (N)', '%', { required: true, min: 0, max: 46, list: true }),
    num('p', 'Phosphate (P₂O₅)', '%', { required: true, min: 0, max: 50, list: true }),
    num('k', 'Potash (K₂O)', '%', { required: true, min: 0, max: 60, list: true }),
    num('moistureMax', 'Max moisture', '%', { required: true, min: 0, max: 5 }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['approved', 'Approved', 'success'],
      ['retired', 'Retired', 'neutral'],
    ],
    [
      ['draft', 'approved', 'Approve recipe', 'approve'],
      ['approved', 'retired', 'Retire'],
      ['retired', 'draft', 'Revive'],
    ],
  )),
  type('bpf', 'orders', ['Production orders', 'Production order', 'PRD'], 'title', [
    text('title', 'Order', { required: true, list: true }),
    ref('formula', 'Formula', 'bpf.formulas', { required: true, list: true }),
    num('qty', 'Batch size', 't', { required: true, min: 1, list: true }),
    pick('line', 'Line', LINES, { required: true, list: true }),
    date('planned', 'Planned start', { required: true, list: true }),
  ], flow(
    [
      ['planned', 'Planned', 'neutral'],
      ['released', 'Released', 'info'],
      ['running', 'In progress', 'warning'],
      ['completed', 'Completed', 'success'],
    ],
    [
      ['planned', 'released', 'Release', 'approve'],
      ['released', 'running', 'Start batch'],
      ['running', 'completed', 'Complete'],
    ],
  ), { sumField: 'qty', groupBy: 'line', dateField: 'planned' }),

  type('mrp', 'requirements', ['Material requirements', 'Requirement', 'MRQ'], 'material', [
    ref('material', 'Material', 'mdm.materials', { required: true, list: true }),
    num('required', 'Required', 't', { required: true, min: 0, list: true }),
    num('onHand', 'On hand', 't', { required: true, min: 0, list: true }),
    calc('shortage', 'Shortage', (v) => Math.max(0, n(v, 'required') - n(v, 'onHand')), { unit: 't', list: true }),
    date('needBy', 'Needed by', { required: true }),
  ], flow(
    [
      ['open', 'Open', 'warning'],
      ['ordered', 'Ordered', 'info'],
      ['covered', 'Covered', 'success'],
    ],
    [
      ['open', 'ordered', 'Raise requisition'],
      ['ordered', 'covered', 'Mark covered'],
    ],
  ), { sumField: 'shortage', dateField: 'needBy' }),
  type('mrp', 'schedule', ['Machine schedule', 'Slot', 'MSC'], 'machine', [
    ref('machine', 'Work centre', 'mrp.workcenters', { required: true, list: true }),
    ref('order', 'Production order', 'bpf.orders', { required: true, list: true }),
    date('start', 'Start', { required: true, list: true }),
    num('hours', 'Duration', 'h', { required: true, min: 1, max: 72, list: true }),
  ], flow(
    [
      ['scheduled', 'Scheduled', 'info'],
      ['running', 'Running', 'warning'],
      ['done', 'Done', 'success'],
    ],
    [
      ['scheduled', 'running', 'Start'],
      ['running', 'done', 'Finish'],
    ],
  ), { sumField: 'hours', groupBy: 'machine', dateField: 'start' }),

  type('qc', 'samples', ['Lab samples', 'Sample', 'SMP'], 'order', [
    ref('order', 'Production order', 'bpf.orders', { required: true, list: true }),
    num('n', 'N', '%', { required: true, min: 0, max: 50 }),
    num('p', 'P₂O₅', '%', { required: true, min: 0, max: 50 }),
    num('k', 'K₂O', '%', { required: true, min: 0, max: 60 }),
    num('moisture', 'Moisture', '%', { required: true, min: 0, max: 10, list: true }),
    calc('result', 'Result', (v) => (n(v, 'moisture') <= 2.5 ? 'Pass' : 'Fail'), { list: true }),
  ], flow(
    [
      ['sampled', 'Sampled', 'neutral'],
      ['tested', 'Tested', 'info'],
      ['approved', 'Released', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['sampled', 'tested', 'Record results'],
      ['tested', 'approved', 'Release batch', 'approve'],
      ['tested', 'rejected', 'Reject for re-processing', 'approve'],
      ['rejected', 'sampled', 'Re-sample'],
    ],
  ), { groupBy: 'result' }),
  type('qc', 'coa', ['Certificates of analysis', 'CoA', 'COA'], 'customer', [
    ref('sample', 'Sample', 'qc.samples', { required: true, list: true }),
    text('customer', 'Customer', { required: true, list: true }),
    date('issued', 'Issue date', { required: true, list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['issued', 'Issued', 'success'],
    ],
    [['draft', 'issued', 'Sign and issue', 'approve']],
  ), { dateField: 'issued' }),

  master('eam', 'assets', ['Plant assets', 'Asset', 'AST'], 'name', [
    text('name', 'Asset', { required: true, list: true }),
    ref('parent', 'Part of', 'eam.assets', { parent: true }),
    pick('kind', 'Kind', ['Granulator', 'Dryer', 'Mixer', 'Conveyor', 'Weighbridge', 'Boiler', 'Motor', 'Gearbox', 'Burner'], { required: true, list: true }),
    pick('site', 'Site', ['Gresik', 'Palembang'], { required: true, list: true }),
    pick('criticality', 'Criticality', ['A', 'B', 'C'], { required: true, list: true }),
    num('mtbf', 'MTBF', 'h', { min: 0 }),
  ], flow(
    [
      ['running', 'Running', 'success'],
      ['maintenance', 'Maintenance', 'warning'],
      ['down', 'Down', 'danger'],
    ],
    [
      ['running', 'maintenance', 'Start maintenance'],
      ['running', 'down', 'Report breakdown'],
      ['maintenance', 'running', 'Back in service'],
      ['down', 'running', 'Back in service'],
    ],
  ), { groupBy: 'kind' }),
  type('eam', 'workorders', ['Maintenance work orders', 'Work order', 'WO'], 'task', [
    text('task', 'Task', { required: true, list: true }),
    ref('asset', 'Asset', 'eam.assets', { required: true, list: true }),
    pick('kind', 'Type', ['Preventive', 'Corrective', 'Emergency', 'Inspection', 'Calibration', 'Improvement'], { required: true, list: true }),
    pick('priority', 'Priority', ['P1', 'P2', 'P3', 'P4'], { required: true, list: true }),
    ref('jobPlan', 'Job plan', 'eam.jobplans'),
    ref('technician', 'Technician', 'eam.technicians', { required: true }),
    ref('failure', 'Failure mode', 'eam.failurecodes'),
    date('due', 'Due', { required: true, list: true }),
    num('labourHours', 'Labour', 'h', { min: 0 }),
    num('downtimeHours', 'Downtime', 'h', { min: 0 }),
    money('partsCost', 'Parts cost', { min: 0 }),
    calc('cost', 'Total cost', (v) => n(v, 'labourHours') * 70_000 + n(v, 'partsCost'), { unit: 'Rp', list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['open', 'Open', 'warning'],
      ['assigned', 'Assigned', 'info'],
      ['progress', 'In progress', 'info'],
      ['waiting', 'Waiting', 'warning'],
      ['completed', 'Completed', 'success'],
      ['verified', 'Verified', 'success'],
      ['closed', 'Closed', 'neutral'],
      ['cancelled', 'Cancelled', 'danger'],
    ],
    [
      ['draft', 'open', 'Approve', 'approve'],
      ['draft', 'cancelled', 'Cancel'],
      ['open', 'assigned', 'Assign'],
      ['assigned', 'progress', 'Start work'],
      ['progress', 'waiting', 'Wait for parts'],
      ['waiting', 'progress', 'Resume'],
      ['progress', 'completed', 'Complete'],
      ['completed', 'verified', 'Verify', 'approve'],
      ['completed', 'progress', 'Reopen'],
      ['verified', 'closed', 'Close'],
    ],
  ), { sumField: 'cost', groupBy: 'kind', dateField: 'due' }),
  type('eam', 'requests', ['Maintenance requests', 'Request', 'MR'], 'title', [
    text('title', 'What is wrong', { required: true, list: true }),
    ref('asset', 'Asset', 'eam.assets', { required: true, list: true }),
    pick('severity', 'Severity', ['Low', 'Medium', 'High', 'Critical'], { required: true, list: true }),
    pick('impact', 'Production impact', ['None', 'Reduced', 'Stopped'], { required: true, list: true }),
    pick('source', 'Reported by', ['Operator', 'Inspection', 'Technician'], { required: true }),
    date('reported', 'Reported', { required: true, list: true }),
  ], flow(
    [
      ['new', 'New', 'warning'],
      ['monitor', 'Monitor', 'info'],
      ['converted', 'Converted to WO', 'success'],
      ['rejected', 'Rejected', 'danger'],
    ],
    [
      ['new', 'converted', 'Convert to work order', 'approve'],
      ['new', 'monitor', 'Monitor'],
      ['monitor', 'converted', 'Convert to work order', 'approve'],
      ['new', 'rejected', 'Reject', 'approve'],
    ],
  ), { groupBy: 'severity', dateField: 'reported' }, true),
  type('eam', 'calibrations', ['Calibration records', 'Calibration', 'CAL'], 'certificate', [
    ref('asset', 'Instrument', 'eam.assets', { required: true, list: true }),
    text('certificate', 'Certificate no.', { required: true, list: true }),
    pick('result', 'Result', ['Pass', 'Adjusted', 'Fail'], { required: true, list: true }),
    text('lab', 'Calibration lab'),
    date('date', 'Calibrated', { required: true }),
    date('nextDue', 'Next due', { required: true, list: true }),
  ], flow(
    [
      ['recorded', 'Recorded', 'info'],
      ['approved', 'Approved', 'success'],
    ],
    [['recorded', 'approved', 'Approve certificate', 'approve']],
  ), { groupBy: 'result', dateField: 'nextDue' }),
  type('eam', 'rca', ['Root cause analyses', 'RCA', 'RCA'], 'title', [
    text('title', 'Problem statement', { required: true, list: true }),
    ref('asset', 'Asset', 'eam.assets', { required: true, list: true }),
    ref('failure', 'Failure mode', 'eam.failurecodes', { list: true }),
    pick('trigger', 'Trigger', ['Repeat failure', 'Critical asset', 'High cost', 'Safety', 'Chronic'], { required: true, list: true }),
    pick('category', 'Root cause (6M)', ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment']),
    note('whys', '5 whys'),
    note('capa', 'Corrective and preventive actions'),
  ], flow(
    [
      ['open', 'Open', 'warning'],
      ['analysis', 'Analysis', 'info'],
      ['actions', 'Actions running', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['open', 'analysis', 'Start analysis'],
      ['analysis', 'actions', 'Agree actions'],
      ['actions', 'closed', 'Close', 'approve'],
    ],
  ), { groupBy: 'trigger' }),

  master('dms', 'distributors', ['Distributors', 'Distributor', 'DST'], 'name', [
    text('name', 'Distributor', { required: true, list: true }),
    pick('region', 'Province', PROVINCES, { required: true, list: true }),
    num('kiosks', 'Kiosks', undefined, { required: true, min: 0, list: true }),
    text('manager', 'Area manager', { list: true }),
  ], ACTIVE, { groupBy: 'region' }),
  type('dms', 'quotas', ['Quota allocations', 'Quota', 'QTA'], 'region', [
    pick('region', 'Province', PROVINCES, { required: true, list: true }),
    pick('scheme', 'Scheme', ['Subsidised', 'Commercial'], { required: true, list: true }),
    num('quota', 'Quota', 't', { required: true, min: 0, list: true }),
    num('used', 'Used', 't', { required: true, min: 0 }),
    calc('usage', 'Usage', (v) => (n(v, 'quota') ? round1((n(v, 'used') / n(v, 'quota')) * 100) : 0), { unit: '%', list: true }),
  ], APPROVAL, { sumField: 'quota', groupBy: 'region' }),
  type('dms', 'orders', ['Sales orders', 'Sales order', 'SO'], 'product', [
    ref('distributor', 'Distributor', 'dms.distributors', { required: true, list: true }),
    pick('product', 'Product', PRODUCTS, { required: true, list: true }),
    pick('scheme', 'Scheme', ['Subsidised', 'Commercial'], { required: true, list: true }),
    num('qty', 'Quantity', 't', { required: true, min: 1 }),
    money('value', 'Value', { required: true, list: true }),
    date('date', 'Order date', { required: true, list: true }),
  ], flow(
    [
      ['draft', 'Draft', 'neutral'],
      ['confirmed', 'Confirmed', 'info'],
      ['shipped', 'Shipped', 'warning'],
      ['delivered', 'Delivered', 'success'],
    ],
    [
      ['draft', 'confirmed', 'Confirm', 'approve'],
      ['confirmed', 'shipped', 'Ship'],
      ['shipped', 'delivered', 'Confirm delivery'],
    ],
  ), { sumField: 'value', groupBy: 'product', dateField: 'date' }),
]

export const RODAME_MASTERS: readonly RecordType[] = [
  master('bpf', 'bom', ['Bills of materials', 'BOM line', 'BOM'], 'material', [
    ref('formula', 'Formula', 'bpf.formulas', { required: true, list: true }),
    ref('material', 'Component', 'mdm.materials', { required: true, list: true }),
    num('kgPerT', 'Quantity per tonne', 'kg', { required: true, min: 0, max: 1000, list: true }),
    num('scrap', 'Scrap allowance', '%', { min: 0, max: 20 }),
  ], ACTIVE, { groupBy: 'formula' }),
  master('mrp', 'workcenters', ['Work centres', 'Work centre', 'WC'], 'name', [
    text('name', 'Work centre', { required: true, list: true }),
    pick('line', 'Line', LINES, { required: true, list: true }),
    pick('kind', 'Kind', ['Granulator', 'Dryer', 'Mixer', 'Cooler', 'Screen', 'Bagging'], { required: true, list: true }),
    num('capacity', 'Capacity', 't/h', { required: true, min: 1, list: true }),
    num('shifts', 'Shifts per day', undefined, { min: 1, max: 3 }),
  ], ACTIVE, { groupBy: 'line' }),
  master('qc', 'plans', ['Inspection plans', 'Inspection plan', 'IP'], 'parameter', [
    ref('formula', 'Grade', 'bpf.formulas', { required: true, list: true }),
    pick('parameter', 'Characteristic', ['Total N', 'P₂O₅', 'K₂O', 'Moisture', 'Granule size 2-4 mm', 'Hardness'], { required: true, list: true }),
    num('min', 'Lower limit', undefined, { list: true }),
    num('max', 'Upper limit', undefined, { list: true }),
    pick('method', 'Method', ['Kjeldahl', 'Spectrophotometry', 'Flame photometry', 'Oven drying', 'Sieve analysis', 'Crush test'], { required: true }),
  ], ACTIVE, { groupBy: 'parameter' }),
  master('eam', 'parts', ['Spare parts', 'Spare part', 'SP'], 'name', [
    text('partNo', 'Part number', { required: true, list: true }),
    text('name', 'Description', { required: true, list: true }),
    num('onHand', 'On hand', 'pcs', { required: true, min: 0, list: true }),
    num('minStock', 'Minimum stock', 'pcs', { required: true, min: 0 }),
    calc('reorder', 'Reorder', (v) => (n(v, 'onHand') <= n(v, 'minStock') ? 'Yes' : 'No'), { list: true }),
    money('unitCost', 'Unit cost'),
  ], ACTIVE, { groupBy: 'reorder' }),
  master('eam', 'plans', ['Maintenance plans', 'Maintenance plan', 'MP'], 'task', [
    text('task', 'Task list', { required: true, list: true }),
    ref('asset', 'Asset', 'eam.assets', { required: true, list: true }),
    pick('strategy', 'Strategy', ['Time based', 'Meter based', 'Condition based'], { required: true, list: true }),
    num('interval', 'Interval', 'days', { required: true, min: 1, list: true }),
    date('nextDue', 'Next due', { list: true }),
  ], ACTIVE, { groupBy: 'strategy', dateField: 'nextDue' }),
  master('dms', 'kiosks', ['Kiosks', 'Kiosk', 'KSK'], 'name', [
    text('name', 'Kiosk', { required: true, list: true }),
    ref('distributor', 'Distributor', 'dms.distributors', { required: true, list: true }),
    text('village', 'Village / kecamatan', { required: true, list: true }),
    num('farmers', 'Registered farmers (RDKK)', undefined, { min: 0, list: true }),
  ], ACTIVE),
  master('dms', 'prices', ['Price lists', 'Price', 'PRC'], 'product', [
    pick('product', 'Product', PRODUCTS, { required: true, list: true }),
    pick('scheme', 'Scheme', ['Subsidised', 'Commercial'], { required: true, list: true }),
    money('pricePerT', 'Price per t (HET)', { required: true, list: true }),
    date('validFrom', 'Valid from', { required: true, list: true }),
  ], APPROVAL, { groupBy: 'product' }),
]

const OPERATIONS = ['Weighing', 'Mixing', 'Granulation', 'Drying', 'Cooling', 'Screening', 'Coating', 'Bagging'] as const

/** CMMS master data, ported from the WIT CMMS: failure codes, job plans, technicians and tools. */
export const CMMS_MASTERS: readonly RecordType[] = [
  master('eam', 'failurecodes', ['Failure codes', 'Failure code', 'FC'], 'name', [
    text('code', 'Code', { required: true, list: true }),
    text('name', 'Description', { required: true, list: true }),
    pick('kind', 'Kind', ['Problem', 'Mode', 'Cause', 'Remedy'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('eam', 'jobplans', ['Job plans', 'Job plan', 'JP'], 'name', [
    text('name', 'Job plan', { required: true, list: true }),
    pick('woType', 'Work type', ['Preventive', 'Inspection', 'Calibration', 'Corrective'], { required: true, list: true }),
    num('duration', 'Standard duration', 'min', { required: true, min: 5, list: true }),
    pick('skill', 'Skill', ['Mechanical', 'Electrical', 'Instrument', 'Welding', 'PLC'], { required: true, list: true }),
    pick('loto', 'Lock-out tag-out', ['Yes', 'No'], { required: true }),
    note('tasks', 'Task list'),
  ], ACTIVE, { groupBy: 'skill' }),
  master('eam', 'technicians', ['Technicians', 'Technician', 'TEC'], 'name', [
    text('name', 'Name', { required: true, list: true }),
    pick('team', 'Team', ['Mechanical', 'Electrical', 'Instrument', 'Utility'], { required: true, list: true }),
    pick('shift', 'Shift', ['A', 'B', 'C', 'Day'], { required: true, list: true }),
    num('level', 'Skill level', '/3', { required: true, min: 1, max: 3 }),
    money('hourlyCost', 'Hourly cost', { list: true }),
  ], ACTIVE, { groupBy: 'team' }),
  master('eam', 'tools', ['Tools', 'Tool', 'TL'], 'name', [
    text('name', 'Tool', { required: true, list: true }),
    pick('category', 'Category', ['Hand tool', 'Lifting', 'Measuring', 'Power tool'], { required: true, list: true }),
    text('serial', 'Serial no.'),
    date('calibrated', 'Last calibration', { list: true }),
  ], flow(
    [
      ['available', 'Available', 'success'],
      ['out', 'Checked out', 'info'],
      ['calibration', 'At calibration', 'warning'],
    ],
    [
      ['available', 'out', 'Check out'],
      ['out', 'available', 'Check in'],
      ['available', 'calibration', 'Send to calibration'],
      ['calibration', 'available', 'Return'],
    ],
  ), { groupBy: 'category' }),
]

/** MES, ported from the WIT MES and fitted to a granulation plant: shifts, routing, shop-floor orders, OEE, downtime and quality. */
export const MES_TYPES: readonly RecordType[] = [
  master('mes', 'shifts', ['Shifts', 'Shift', 'SH'], 'name', [
    text('code', 'Code', { required: true, list: true }),
    text('name', 'Name', { required: true, list: true }),
    text('start', 'Starts', { required: true, list: true }),
    text('end', 'Ends', { required: true, list: true }),
    num('breakMin', 'Breaks', 'min', { min: 0 }),
  ], ACTIVE),
  master('mes', 'reasons', ['Reason codes', 'Reason code', 'RSN'], 'name', [
    text('code', 'Code', { required: true, list: true }),
    text('name', 'Description', { required: true, list: true }),
    pick('kind', 'Used for', ['Downtime', 'Scrap', 'Pause', 'Hold'], { required: true, list: true }),
    pick('planned', 'Planned stop', ['Yes', 'No'], { list: true }),
  ], ACTIVE, { groupBy: 'kind' }),
  master('mes', 'defects', ['Defect codes', 'Defect code', 'DEF'], 'name', [
    text('code', 'Code', { required: true, list: true }),
    text('name', 'Defect', { required: true, list: true }),
    pick('severity', 'Severity', ['Minor', 'Major', 'Critical'], { required: true, list: true }),
  ], ACTIVE, { groupBy: 'severity' }),
  master('mes', 'routing', ['Routings (BOP)', 'Operation', 'OP'], 'operation', [
    ref('formula', 'Grade', 'bpf.formulas', { required: true, list: true }),
    num('seq', 'Sequence', undefined, { required: true, min: 10, list: true }),
    pick('operation', 'Operation', OPERATIONS, { required: true, list: true }),
    ref('workcenter', 'Work centre', 'mrp.workcenters', { required: true, list: true }),
    num('minPerT', 'Standard time', 'min/t', { required: true, min: 0 }),
    pick('qualityGate', 'Quality gate', ['Yes', 'No']),
  ], ACTIVE, { groupBy: 'operation' }),

  type('mes', 'workorders', ['Shop-floor work orders', 'Shop-floor order', 'SWO'], 'operation', [
    ref('order', 'Production order', 'bpf.orders', { required: true, list: true }),
    pick('operation', 'Operation', OPERATIONS, { required: true, list: true }),
    ref('workcenter', 'Work centre', 'mrp.workcenters', { required: true, list: true }),
    ref('shift', 'Shift', 'mes.shifts', { required: true }),
    text('operator', 'Operator'),
    num('target', 'Target', 't', { required: true, min: 1, list: true }),
    num('good', 'Good output', 't', { min: 0 }),
    num('reject', 'Reject', 't', { min: 0 }),
    calc('yield', 'Yield', (v) => (n(v, 'good') + n(v, 'reject') ? round1((n(v, 'good') / (n(v, 'good') + n(v, 'reject'))) * 100) : 0), { unit: '%', list: true }),
    date('date', 'Production date', { required: true }),
  ], flow(
    [
      ['waiting', 'Waiting', 'neutral'],
      ['ready', 'Ready', 'info'],
      ['running', 'Running', 'warning'],
      ['paused', 'Paused', 'danger'],
      ['completed', 'Completed', 'success'],
    ],
    [
      ['waiting', 'ready', 'Release to floor', 'approve'],
      ['ready', 'running', 'Start'],
      ['running', 'paused', 'Pause'],
      ['paused', 'running', 'Resume'],
      ['running', 'completed', 'Complete'],
    ],
  ), { sumField: 'good', groupBy: 'operation', dateField: 'date' }),
  type('mes', 'oee', ['OEE records', 'OEE record', 'OEE'], 'workcenter', [
    ref('workcenter', 'Work centre', 'mrp.workcenters', { required: true, list: true }),
    ref('shift', 'Shift', 'mes.shifts', { required: true, list: true }),
    date('date', 'Date', { required: true, list: true }),
    num('availability', 'Availability', '%', { required: true, min: 0, max: 100 }),
    num('performance', 'Performance', '%', { required: true, min: 0, max: 100 }),
    num('quality', 'Quality', '%', { required: true, min: 0, max: 100 }),
    calc('oee', 'OEE', (v) => round1((n(v, 'availability') * n(v, 'performance') * n(v, 'quality')) / 10_000), { unit: '%', list: true }),
  ], flow(
    [
      ['recorded', 'Recorded', 'info'],
      ['confirmed', 'Confirmed', 'success'],
    ],
    [['recorded', 'confirmed', 'Confirm shift', 'approve']],
  ), { groupBy: 'workcenter', dateField: 'date' }),
  type('mes', 'downtime', ['Downtime events', 'Downtime event', 'DT'], 'reason', [
    ref('workcenter', 'Work centre', 'mrp.workcenters', { required: true, list: true }),
    ref('reason', 'Reason', 'mes.reasons', { required: true, list: true }),
    ref('shift', 'Shift', 'mes.shifts', { required: true }),
    date('date', 'Date', { required: true, list: true }),
    num('minutes', 'Duration', 'min', { required: true, min: 1, list: true }),
    note('note', 'What happened'),
  ], flow(
    [
      ['logged', 'Logged', 'warning'],
      ['verified', 'Verified', 'success'],
    ],
    [['logged', 'verified', 'Verify', 'approve']],
  ), { sumField: 'minutes', groupBy: 'reason', dateField: 'date' }, true),
  type('mes', 'holds', ['Quality holds', 'Quality hold', 'QH'], 'defect', [
    ref('order', 'Production order', 'bpf.orders', { required: true, list: true }),
    ref('defect', 'Defect', 'mes.defects', { required: true, list: true }),
    num('qty', 'Quantity held', 't', { required: true, min: 0, list: true }),
    pick('disposition', 'Disposition', ['Rework', 'Scrap', 'Use as is', 'Release'], { list: true }),
  ], flow(
    [
      ['active', 'On hold', 'danger'],
      ['dispositioned', 'Dispositioned', 'warning'],
      ['released', 'Released', 'success'],
    ],
    [
      ['active', 'dispositioned', 'Set disposition'],
      ['dispositioned', 'released', 'Release hold', 'approve'],
    ],
  ), { sumField: 'qty', groupBy: 'disposition' }),
  type('mes', 'ncr', ['Non-conformance reports', 'NCR', 'NCR'], 'title', [
    text('title', 'Non-conformance', { required: true, list: true }),
    ref('order', 'Production order', 'bpf.orders', { list: true }),
    ref('defect', 'Defect', 'mes.defects', { required: true, list: true }),
    note('containment', 'Containment'),
    note('action', 'Corrective action'),
  ], flow(
    [
      ['open', 'Open', 'danger'],
      ['containment', 'Containment', 'warning'],
      ['disposition', 'Disposition', 'info'],
      ['closed', 'Closed', 'success'],
    ],
    [
      ['open', 'containment', 'Contain'],
      ['containment', 'disposition', 'Decide disposition'],
      ['disposition', 'closed', 'Close', 'approve'],
    ],
  )),
]
